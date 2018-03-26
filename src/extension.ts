import * as vscode from 'vscode'
import { IssueProvider, IIssueNode } from './IssueProvider'

export function activate(context: vscode.ExtensionContext) {

	let issueProvider = new IssueProvider(context)
	context.subscriptions.push(vscode.window.registerTreeDataProvider('githubIssueBrowser', issueProvider))

	const output = vscode.window.createOutputChannel('GitHub问题输出')

	context.subscriptions.push(vscode.commands.registerCommand("gitissue.addIssue", () => {
		issueProvider.createIssue()
	}));
	context.subscriptions.push(vscode.commands.registerCommand("gitissue.viewOnCommand", async (node: IIssueNode) => {
		output.show()
		output.clear()
		output.append(node.title)
		output.append('\n-----------------\n')
		output.append(node.body)
	}));
	context.subscriptions.push(vscode.commands.registerCommand("gitissue.refreshIssues", () => {
		issueProvider.loadIssues('open')
		issueProvider.loadIssues('closed')
	}));
	context.subscriptions.push(vscode.commands.registerCommand("gitissue.setGithubToken", () => {
		issueProvider.autoCreateToken(true)
	}));
}

// this method is called when your extension is deactivated
export function deactivate() {
}