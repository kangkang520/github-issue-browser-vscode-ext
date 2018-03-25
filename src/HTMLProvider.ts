import * as vscode from 'vscode'
import * as MarkdownIt from 'markdown-it'
import * as hljs from 'highlight.js'
import * as fs from 'fs'

export type RenderType = 'url' | 'markdown' | 'html'

export class HTMLProvider implements vscode.TextDocumentContentProvider {

	private _onDidChange = new vscode.EventEmitter<vscode.Uri>();
	private _renderType: RenderType = 'url'
	private _mdStr: string = ''
	private _url: string = ''
	private _html: string = ''
	private uri = vscode.Uri.parse('html-preview://')
	private _title = ''

	constructor(private context: vscode.ExtensionContext) {
		context.subscriptions.push(vscode.workspace.registerTextDocumentContentProvider("html-preview", this))
	}

	private markdown2html(mdStr: string): string {
		let md: MarkdownIt.MarkdownIt = new MarkdownIt({
			highlight: function (str, lang) {
				if (lang && hljs.getLanguage(lang)) {
					try {
						return '<pre class="hljs"><code>' +
							hljs.highlight(lang, str, true).value +
							'</code></pre>';
					} catch (__) { }
				}
				return '<pre class="hljs"><code>' + md.utils.escapeHtml(str) + '</code></pre>';
			}
		})
		return md.render(mdStr)
	}

	get onDidChange(): vscode.Event<vscode.Uri> {
		return this._onDidChange.event;
	}

	provideTextDocumentContent(uri: vscode.Uri, token: vscode.CancellationToken): vscode.ProviderResult<string> {
		let str = `<!DOCTYPE html>
		<html lang="en">
		<head>
			<meta charset="UTF-8">
			<meta name="viewport" content="width=device-width, initial-scale=1.0">
			<meta http-equiv="X-UA-Compatible" content="ie=edge">
		</head>
		<body>
		<div style="position:absolute; left:0; top:0; right:0; bottom:0;">
			${this.getContent()}
		</div>
		</body>
		</html>`
		console.log(str)
		return str
	}

	private getContent(): string {
		if (this._renderType == 'markdown') return this.markdown2html(this._mdStr)
		else return this._html
	}

	public set markdown(mdStr: string) {
		this._renderType = 'markdown'
		this._mdStr = mdStr
		this._onDidChange.fire(this.uri);
	}

	public set url(url: string) {
		this._renderType = 'url'
		this._url = url
		this._onDidChange.fire(this.uri);
	}

	public set html(html: string) {
		this._renderType = 'html'
		this._html = html
		this._onDidChange.fire(this.uri);
	}

	public set title(title: string) {
		this._title = title
	}

	public render(column?: vscode.ViewColumn) {
		let uri = (this._renderType == 'url') ? (() => {
			fs.writeFileSync(this.context.asAbsolutePath('res/web/main.js'), `window.targetSrc="${this._url}"`)
			return vscode.Uri.file(this.context.asAbsolutePath('res/web/index.html'))
		})() : this.uri
		vscode.commands.executeCommand('vscode.previewHtml', uri, column || vscode.ViewColumn.One, this._title)
	}
}