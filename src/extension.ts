import * as vscode from 'vscode'
import { IssueProvider, IIssueNode } from './IssueProvider'


export function activate(context: vscode.ExtensionContext) {
	let currentViewIssue: IIssueNode = null as any

	let issueProvider = new IssueProvider(context)
	context.subscriptions.push(vscode.window.registerTreeDataProvider('githubIssueBrowser', issueProvider))

	const output = vscode.window.createOutputChannel('GitHub问题输出')
	function showIssueDetails(issue: IIssueNode) {
		currentViewIssue = issue
		output.show()
		output.clear()
		output.appendLine(`问题:${issue.title}`)
		output.appendLine(`来源:[@${issue.user}]`)
		output.appendLine(`内容:\n${issue.body}`)
		output.append('\n')
		//获取回复列表
		issueProvider.commentsOfIssue(issue.number).forEach(comment => {
			output.appendLine(`评论:[@${comment.user}]\n${comment.body}\n`)
		})
	}


	issueProvider.onCommentLoad(() => {
		if (!currentViewIssue) return
		showIssueDetails(currentViewIssue)
	})
	context.subscriptions.push(vscode.commands.registerCommand("gitissue.addIssue", () => {
		issueProvider.createIssue()
	}));
	context.subscriptions.push(vscode.commands.registerCommand("gitissue.viewOnCommand", async (node: IIssueNode) => {
		showIssueDetails(node)
	}));
	context.subscriptions.push(vscode.commands.registerCommand("gitissue.refreshIssues", () => {
		issueProvider.loadIssues('open')
		issueProvider.loadIssues('closed')
		issueProvider.loadComments()
	}));
	context.subscriptions.push(vscode.commands.registerCommand("gitissue.setGithubToken", () => {
		issueProvider.autoCreateToken(true)
	}));
	context.subscriptions.push(vscode.commands.registerCommand("gitissue.addComment", (node: IIssueNode) => {
		issueProvider.createComment(node)
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {
}