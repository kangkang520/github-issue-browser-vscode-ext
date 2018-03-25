'use strict';
// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode'
import { IssueProvider, IIssueNode } from './IssueProvider'
// import { HTMLProvider } from './HTMLProvider'


// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {

	let issueProvider = new IssueProvider(context)
	context.subscriptions.push(vscode.window.registerTreeDataProvider('githubIssueBrowser', issueProvider))

	// let htmlProvider = new HTMLProvider(context);

	const output = vscode.window.createOutputChannel('GitHub问题输出')

	context.subscriptions.push(vscode.commands.registerCommand("gitissue.addIssue", () => {
		issueProvider.createIssue()
	}));
	// context.subscriptions.push(vscode.commands.registerCommand("gitissue.viewOnWeb", async (node: IIssueNode) => {
	// 	htmlProvider.title = node.title
	// 	htmlProvider.markdown = node.body//issueProvider.getIssueUrl(node.number)
	// 	htmlProvider.render()
	// }));
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

	return {
		extendMarkdownIt(md: any) {
			return md.use(require('markdown-it'));
		}
	}
}

// this method is called when your extension is deactivated
export function deactivate() {
}