'use strict';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as child_process from 'child_process';

const commandExists = require('command-exists').sync;

const exeName = "cabal-fmt";


export function activate(context: vscode.ExtensionContext) {

	vscode.languages.registerDocumentFormattingEditProvider({ pattern: "**​/*.cabal" }, new CabalFormatProvider());
}

export function deactivate() { }


class CabalFormatProvider implements vscode.DocumentFormattingEditProvider {
	protected findManual(): string | null {
		let path = vscode.workspace.getConfiguration('vscode-cabal-fmt').binaryPath;
		if (path === '') {
			return null;
		}
		path = path.replace('${HOME}', os.homedir).replace('${home}', os.homedir).replace(/^~/, os.homedir);

		if (!commandExists(path)) {
			throw new Error(`Unable to find ${path}`);
		}
		return path;
	}
	protected findLocal(): string | null {
		if (commandExists(exeName)) {
			return exeName;
		}
		return null;
	}

	provideDocumentFormattingEdits(document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {

		return new Promise((resolve, rejects) => {
			let filepath = document.uri.toString();
			const binaryPath = this.findLocal() ?? this.findManual();
			if (binaryPath === null) {
				rejects("Unable to call cabal-fmt");
			}
			if (filepath.startsWith('file://')) {
				filepath = path.dirname(document.fileName);
			}
			vscode.window.showInformationMessage(`filepath: ${filepath}`);
			const cmd = child_process.spawn(binaryPath!, [filepath]);
			const result: Buffer[] = [];
			const err: Buffer[] = [];
			cmd.stdout.on('data', data => {
				result.push(Buffer.from(data));
			});
			cmd.stderr.on('data', data => {
				err.push(Buffer.from(data));
			});
			cmd.on('exit', _ => {
				const r = Buffer.concat(result).toString();
				const e = Buffer.concat(err).toString();
				if (r.length > 0) {
					const range = document.validateRange(new vscode.Range(0, 0, Infinity, Infinity));
					resolve([new vscode.TextEdit(range, r)]);
				} else {
					rejects(`error: ${e}`);
				}
			});
		});
	}

}