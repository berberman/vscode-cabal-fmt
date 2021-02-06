'use strict';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as child_process from 'child_process';

const commandExists = require('command-exists').sync;

const exeName = "cabal-fmt";


export function activate(context: vscode.ExtensionContext) {

	vscode.languages.registerDocumentFormattingEditProvider('cabal', new CabalFormatProvider());

}

class CabalFormatProvider implements vscode.DocumentFormattingEditProvider {
	protected findManual(): string | null {
		let path = vscode.workspace.getConfiguration('cabal-fmt').binaryPath;
		if (path === '') {
			return null;
		}
		path = path.replace('${HOME}', os.homedir).replace('${home}', os.homedir).replace(/^~/, os.homedir);

		if (!commandExists(path)) {
			vscode.window.showErrorMessage(`Path to cabal-fmt is set to an unknown place: ${path}`);
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

			let filepath = document.fileName;
			const binaryPath = this.findManual() ?? this.findLocal();
			if (binaryPath === null) {
				vscode.window.showErrorMessage(`Path to cabal-fmt is null`);
				rejects("Unable to call cabal-fmt");
			}
			const indent = vscode.workspace.getConfiguration('cabal-fmt').indent;
			vscode.window.showInformationMessage(`Formatting ${path.basename(filepath)}`);
			const cmd = child_process.spawn(binaryPath!, ["--indent", indent, filepath]);
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
					vscode.window.showErrorMessage(`Stderr from cabal-fmt: ${e}`);
					rejects(`error: ${e}`);
				}
			});
			cmd.on('error', e => {
				vscode.window.showErrorMessage(`Failed to call cabal-fmt: ${e}`);
				rejects(`error: ${e}`);
			});
		});
	}

}
