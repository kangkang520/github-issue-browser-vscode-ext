import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import * as ghutils from 'ghutils'

export interface ICommentNode {
	id: number
	user: string
	body: string
	issue: number
}

export interface IIssueNode {
	id: number
	title: string
	body: string
	labels: Array<string>
	number: number
	user: string
	opened: boolean
	type: 'issue'
}

export interface IStateNode {
	name: 'open' | 'closed',
	type: 'state'
}

export interface ILabelNode {
	text: string,
	type: 'label'
}

type DataNode = IIssueNode | IStateNode | ILabelNode


export class IssueProvider implements vscode.TreeDataProvider<DataNode> {

	private issues = { open: null as any, closed: null as any } as { open: Array<IIssueNode>, closed: Array<IIssueNode> }
	private comments: Array<ICommentNode> = null as any
	private _onDidChange: vscode.EventEmitter<DataNode> = new vscode.EventEmitter<DataNode>()

	private commentLoadCB: () => any = null as any
	readonly onDidChangeTreeData = this._onDidChange.event;

	private githubInfo = { user: '', repo: '' }

	private _ghtoken = ''

	private numberInfo = {
		issue: 0,
		comment: 0,
	}

	constructor(private contex: vscode.ExtensionContext) {
		let { user, repo } = this.getGithubInfo() || {} as any
		this.githubInfo.user = user || ''
		this.githubInfo.repo = repo || ''
		this.loadIssues('open')
		this.loadIssues('closed')
		this.loadComments()
		//加载计数信息
		try {
			let numberFile = this.contex.asAbsolutePath('res/number.json')
			if (fs.existsSync(numberFile)) {
				let result = JSON.parse(fs.readFileSync(numberFile) + '')
				this.numberInfo = { issue: result.issue || 0, comment: result.comment || 0 }
			}
		} catch (e) {
		}
	}

	//是否有GitHub配置
	public get hasGithubConfig() {
		return !!(this.githubInfo.user && this.githubInfo.repo)
	}

	//刷新
	public refresh() {
		this._onDidChange.fire()
	}

	//生成条目
	public getTreeItem(elem: DataNode): vscode.TreeItem {
		if (!this.hasGithubConfig) return { label: '当前项目非GitHub项目' }
		if (elem.type == 'issue') return {
			id: elem.id + '',
			label: `[${this.commentsOfIssue(elem.number).length}] ${elem.title}`,
			// resourceUri: vscode.Uri.parse('before:github-issue-' + this.getLabelImage(elem.labels)),
			iconPath: this.contex.asAbsolutePath('res/' + this.getLabelImage(elem.labels) + '.svg'),
			tooltip: elem.title,
			collapsibleState: vscode.TreeItemCollapsibleState.None,
			contextValue: elem.opened ? 'openedIssue' : 'closedIssue',
			command: {
				title: "查看Issue",
				command: "gitissue.viewOnCommand",
				arguments: [elem]
			}
		}
		else if (elem.type == 'state') return {
			label: (elem.name == 'open') ? '开启中的问题' : '已关闭的问题',
			collapsibleState: vscode.TreeItemCollapsibleState[(elem.name == 'open') ? 'Expanded' : 'Collapsed']
		}
		else return { label: elem.text }
	}

	//获取孩子
	public getChildren(elem: DataNode): vscode.ProviderResult<Array<DataNode>> {
		if (!this.hasGithubConfig) return []
		if (!elem) return [{ type: 'state', name: 'open' }, { type: 'state', name: 'closed' }]
		else if (elem.type == 'state') {
			let issues = this.issues[(elem as IStateNode).name]
			if (issues === null) return [{ text: '加载中...', type: 'label' }]
			else if (issues.length <= 0) return [{ text: '暂无问题', type: 'label' }]
			return issues
		}
		else return []
	}

	//获取当前项目的GitHub信息
	private getGithubInfo(): { user: string, repo: string } | null {
		let root = vscode.workspace.rootPath
		if (!root || !fs.existsSync(root)) return null
		let gitConfig = fs.readFileSync(path.join(vscode.workspace.rootPath as string, '.git/config')) + ''
		let [, user, repo] = gitConfig.match(/\[remote\s+"origin"\][\n\s]+?url\s*=\s*https?:\/\/[w\.]*github\.com\/(\S+?)\/(\S+?).git[\n$]/) || [] as Array<string>
		if (!user || !repo) return null
		return { user, repo }
	}

	//获取label对应的图片
	private getLabelImage(labels: Array<string>) {
		if (labels.indexOf('bug') >= 0) return 'bug'
		if (labels.indexOf('question') >= 0) return 'question'
		if (labels.indexOf('help wanted') >= 0) return 'require'
		return 'other'
	}

	//获取GitHub token
	private get githubToken(): string {
		if (this._ghtoken) return this._ghtoken
		let tokenPath = this.contex.asAbsolutePath('res/token.json')
		if (!fs.existsSync(tokenPath)) return ''
		try {
			let { token } = JSON.parse(fs.readFileSync(tokenPath) + '')
			this._ghtoken = token
			return token
		} catch (e) {
			return ''
		}
	}

	//设置GitHub token
	private set githubToken(token: string) {
		let tokenPath = this.contex.asAbsolutePath('res/token.json')
		fs.writeFileSync(tokenPath, JSON.stringify({ token }))
		this._ghtoken = token
	}

	//创建token
	public async autoCreateToken(force: boolean = false): Promise<string> {
		if (this.githubToken && !force) return this.githubToken
		let token = await vscode.window.showInputBox({
			placeHolder: '请输入GitHub的Token',
		})
		if (token) this.githubToken = token
		return token || ''
	}

	//加载问题列表
	public async loadIssues(state: 'open' | 'closed') {
		if (!this.hasGithubConfig) return
		let token = await this.autoCreateToken()
		this.issues[state] = null as any
		this.refresh()
		ghutils.lister({ token }, `https://api.github.com/repos/${this.githubInfo.user}/${this.githubInfo.repo}/issues?state=${state}`, {}, (err: Error, result: Array<IIssueNode>) => {
			if (err) return vscode.window.showErrorMessage(err.message)
			this.issues[state] = result.map((i: IIssueNode & { [i: string]: any, user: any }) => ({
				id: i.id,
				title: i.title,
				body: i.body,
				labels: i.labels.map((l: any) => l.name),
				number: i.number,
				type: 'issue' as any,
				opened: state == 'open',
				user: i.user.login
			}))
			this.refresh()
			if (state == 'open') {
				let maxNumber = Math.max(...result.map(r => r.number))
				if (maxNumber > this.numberInfo.issue) {
					let issue = result.filter(r => r.number == maxNumber)[0]
					vscode.window.showInformationMessage('GitHub新问题：' + issue.body)
					this.setNumber(maxNumber, this.numberInfo.comment)
				}
			}
		})
	}

	//加载评论
	public async loadComments() {
		if (!this.hasGithubConfig) return
		let token = await this.autoCreateToken()
		this.comments = null as any
		this.refresh()
		ghutils.lister({ token }, `https://api.github.com/repos/${this.githubInfo.user}/${this.githubInfo.repo}/issues/comments`, {}, (err: Error, result: Array<any>) => {
			if (err) return vscode.window.showErrorMessage(err.message)
			this.comments = result.map(comment => ({
				id: comment.id,
				user: comment.user.login,
				body: comment.body,
				issue: this.getIssueNumberFromIssueUrl(comment.issue_url)
			}))
			this.commentLoadCB && this.commentLoadCB()
			this.refresh()
			//提示
			let maxId = Math.max(...result.map(r => r.id))
			if (maxId > this.numberInfo.comment) {
				let comment = result.filter(r => r.id == maxId)[0]
				vscode.window.showInformationMessage('GitHub新评论：\n' + comment.body)
				this.setNumber(this.numberInfo.issue, maxId)
			}
		})
	}

	//获取某个Issue的评论
	public commentsOfIssue(issueNumber: number) {
		return this.comments.filter(c => c.issue == issueNumber)
	}

	//保存计数
	private setNumber(issue: number, comment: number) {
		this.numberInfo = { issue, comment }
		fs.writeFileSync(this.contex.asAbsolutePath('res/number.json'), JSON.stringify(this.numberInfo))
	}

	private labelName(label: string): string | undefined {
		return ({
			'Bug': 'bug',
			'需求': 'help wanted',
			'问题': 'question',
		} as any)[label] || undefined
	}

	private getIssueNumberFromIssueUrl(url: string): number {
		let [, id] = url.match(/\/(\d+)$/) || [] as any
		return parseInt(id)
	}

	//添加问题
	public async createIssue() {
		let token = await this.autoCreateToken()
		if (!this.hasGithubConfig || !token) return
		let title = await vscode.window.showInputBox({
			prompt: '问题标题不要太长，20字以内',
			placeHolder: '标题',
			validateInput: str => (str && str.length > 20) ? '字数太多' : null
		})
		if (!title) return
		let label = await vscode.window.showQuickPick(['Bug', '问题', '需求', '其它'], {
			placeHolder: '类型'
		})
		if (!label) return
		let body = await vscode.window.showInputBox({
			placeHolder: '具体内容',
			validateInput: str => (str && str.length < 5) ? '至少输入5个字' : null
		})
		if (!body) return
		//提交数据
		label = this.labelName(label)
		ghutils.ghpost({ token }, `https://api.github.com/repos/${this.githubInfo.user}/${this.githubInfo.repo}/issues`, { title, body, ...(label ? { labels: [label] } : {}) }, {}, (err: Error, issue: IIssueNode) => {
			if (err) return vscode.window.showErrorMessage(err.message)
			setTimeout(() => this.loadIssues('open'), 1500)
			this.setNumber(issue.number, this.numberInfo.comment)
		})
	}

	public getIssueUrl(number: number): string {
		return `https://github.com/${this.githubInfo.user}/${this.githubInfo.repo}/issues/${number}`
	}

	//评论加载完毕事件
	public onCommentLoad(callback: () => any) {
		this.commentLoadCB = callback
	}

	//发起评论
	public async createComment(issue: IIssueNode) {
		let token = await this.autoCreateToken()
		if (!this.hasGithubConfig || !token) return
		let body = await vscode.window.showInputBox({
			prompt: '请输入评论内容，至少5个字',
			placeHolder: '评论内容',
			validateInput: str => (str && str.length < 5) ? '至少输入5个字' : null
		})
		if (!body) return
		ghutils.ghpost({ token }, `https://api.github.com/repos/${this.githubInfo.user}/${this.githubInfo.repo}/issues/${issue.number}/comments`, { body }, (err: Error, comment: any) => {
			if (err) return vscode.window.showErrorMessage(err.message)
			setTimeout(() => this.loadComments(), 1500)
			this.setNumber(this.numberInfo.issue, comment.id)
		})
	}

}