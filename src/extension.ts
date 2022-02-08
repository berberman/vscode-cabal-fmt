'use strict';
import * as os from 'os';
import * as path from 'path';
import * as vscode from 'vscode';
import * as child_process from 'child_process';
import * as tmp from 'tmp';
import * as fs from 'fs';

const commandExists = require('command-exists').sync;
const exeName = "cabal-fmt";


export function activate(context: vscode.ExtensionContext) {

  vscode.languages.registerDocumentFormattingEditProvider('cabal', new CabalFormatProvider());

  if (vscode.workspace.getConfiguration('cabal-fmt').autoFormat) {
    const mapping = new Map<string, vscode.FileSystemWatcher | undefined>()

    vscode.workspace.workspaceFolders?.forEach(async folder => {
      mapping.set(folder.uri.toString(), await listen(folder))
    })

    vscode.workspace.onDidChangeWorkspaceFolders(async e => {
      for (const folder of e.removed) {
        mapping.get(folder.uri.toString())?.dispose()
        mapping.delete(folder.uri.toString())
      }
      for (const folder of e.added) {
        mapping.set(folder.uri.toString(), await listen(folder))
      }
    })
  }
}

function findManual(): string | null {
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

function findLocal(): string | null {
  if (commandExists(exeName)) {
    return exeName;
  }
  return null;
}

async function listen(folder: vscode.WorkspaceFolder): Promise<vscode.FileSystemWatcher | undefined> {
  const cabalFiles = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "**/*.cabal"))
  const stackYaml = await vscode.workspace.findFiles(new vscode.RelativePattern(folder, "stack.yaml"))
  if (cabalFiles.length == 0) return
  if (stackYaml.length != 0) return

  function doFormat(file: vscode.Uri) {
    for (const cabal of cabalFiles) {
      const root = path.dirname(cabal.fsPath)
      if (file.fsPath.startsWith(root)) {
        fs.writeFileSync(cabal.fsPath, cabalFmt(cabal.fsPath, cabal.fsPath));
      }
    }
  }

  const watcher = vscode.workspace.createFileSystemWatcher(new vscode.RelativePattern(folder, "**/*.{lhs,hs}"))
  watcher.onDidChange(doFormat);
  watcher.onDidCreate(doFormat);
  watcher.onDidDelete(doFormat);
  return watcher
}

function cabalFmt(filePath: string, nominalPath: string): Promise<string> {
  return new Promise((resolve, rejects) => {
    const binaryPath = findManual() ?? findLocal();
    if (binaryPath === null) {
      vscode.window.showErrorMessage(`Path to cabal-fmt is null`);
      rejects("Unable to call cabal-fmt");
    }
    const indent = vscode.workspace.getConfiguration('cabal-fmt').indent;

    const cmd = child_process.spawn(binaryPath!, ["--indent", indent, filePath]);
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
      const e = Buffer.concat(err).toString().replace(new RegExp(filePath, 'g'), path.basename(nominalPath));
      if (r.length > 0) {
        resolve(r);
      } else {
        vscode.window.showErrorMessage(`cabal-fmt: ${e}`);
        rejects(`error: ${e}`);
      }
    });
    cmd.on('error', e => {
      vscode.window.showErrorMessage(`Failed to call cabal-fmt: ${e}`);
      rejects(`error: ${e}`);
    });
  })
}

class CabalFormatProvider implements vscode.DocumentFormattingEditProvider {
  provideDocumentFormattingEdits(document: vscode.TextDocument): Thenable<vscode.TextEdit[]> {
    return new Promise((resolve, rejects) => {
      tmp.file({ prefix: ".cabal-fmt", tmpdir: path.dirname(document.fileName) }, function _tempFileCreated(tmpErr, tmpPath, _fd, cleanupCallback) {
        if (tmpErr) { throw tmpErr; }
        fs.writeFileSync(tmpPath, document.getText());
        vscode.window.showInformationMessage(`Formatting ${path.basename(document.fileName)}`);

        cabalFmt(tmpPath, document.fileName)
          .then(r => {
            const range = document.validateRange(new vscode.Range(0, 0, Infinity, Infinity));
            resolve([new vscode.TextEdit(range, r)]);
          })
          .catch(rejects)
          .finally(cleanupCallback);
      });

    });
  }

}
