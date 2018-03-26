import * as vscode from 'vscode'
import * as path from 'path'
import * as fs from 'fs'
import * as ghissues from 'ghissues'

export interface IIssueNode {
	id: number
	title: string
	body: string
	labels: Array<string>
	number: number
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
	private _onDidChange: vscode.EventEmitter<DataNode> = new vscode.EventEmitter<DataNode>()
	readonly onDidChangeTreeData = this._onDidChange.event;

	private githubInfo = { user: '', repo: '' }

	private _ghtoken = ''

	constructor(private contex: vscode.ExtensionContext) {
		let { user, repo } = this.getGithubInfo() || {} as any
		this.githubInfo.user = user || ''
		this.githubInfo.repo = repo || ''
		this.loadIssues('open')
		this.loadIssues('closed')
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
			label: elem.title,
			iconPath: this.contex.asAbsolutePath('res/' + this.getLabelImage(elem.labels)),
			tooltip: elem.title,
			collapsibleState: vscode.TreeItemCollapsibleState.None,
			contextValue: 'openedIssue',
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
		if (labels.indexOf('bug') >= 0) return 'bug.svg'
		if (labels.indexOf('question') >= 0) return 'question.svg'
		if (labels.indexOf('help wanted') >= 0) return 'require.svg'
		return 'other.svg'
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
		this.issues[state] = null as any
		this.refresh()
		ghissues.list({}, this.githubInfo.user, this.githubInfo.repo, (err: Error, result: Array<IIssueNode>) => {
			if (err) return vscode.window.showErrorMessage(err.message)
			this.issues[state] = result.map(i => ({
				id: i.id,
				title: i.title,
				body: i.body,
				labels: i.labels.map((l: any) => l.name),
				number: i.number,
				type: 'issue'
			} as IIssueNode))
			this.refresh()
			if (state == 'open') {
				let toast = false
				let maxNumber = Math.max(...result.map(r => r.number))
				let numberFile = this.contex.asAbsolutePath('res/number.json')
				try {
					if (!fs.existsSync(numberFile)) toast = true
					else if (parseInt(fs.readFileSync(numberFile) + '') < maxNumber) toast = true
				} catch (e) {
				}
				if (toast) {
					let issue = result.filter(r => r.number == maxNumber)[0]
					vscode.window.showInformationMessage('新问题：' + issue.body)
					this.setNumber(maxNumber)
				}
			}
		})
	}

	private setNumber(nu: number) {
		fs.writeFileSync(this.contex.asAbsolutePath('res/number.json'), nu)
	}

	private labelName(label: string): string | undefined {
		return ({
			'Bug': 'bug',
			'需求': 'help wanted',
			'问题': 'question',
		} as any)[label] || undefined
	}

	//添加问题
	public async createIssue() {
		try {
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
			ghissues.create({ token },
				this.githubInfo.user, this.githubInfo.repo,
				{ title, body, ...(label ? { labels: [label] } : {}) },
				(err: Error, issue: IIssueNode) => {
					if (err) return vscode.window.showErrorMessage(err.message)
					setTimeout(() => this.loadIssues('open'), 1000)
					this.setNumber(issue.number)
				})
		} catch (e) {
			vscode.window.showErrorMessage(e.message)
		}
	}

	public getIssueUrl(number: number): string {
		return `https://github.com/${this.githubInfo.user}/${this.githubInfo.repo}/issues/${number}`
	}

}