import { basename, join, normalize } from 'path';
import { TextDocument, workspace, extensions, WorkspaceConfiguration, Uri } from 'vscode';

import { KNOWN_EXTENSIONS, KNOWN_LANGUAGES } from './constants';
import type { API, GitExtension } from './git';
import { log, LogLevel } from './logger';

let git: API | null | undefined;

type WorkspaceExtensionConfiguration = WorkspaceConfiguration & {
	enabled: boolean;
	detailsIdling: string;
	detailsEditing: string;
	detailsDebugging: string;
	lowerDetailsIdling: string;
	lowerDetailsEditing: string;
	lowerDetailsDebugging: string;
	lowerDetailsNoWorkspaceFound: string;
	largeImageIdling: string;
	largeImage: string;
	smallImage: string;
	suppressNotifications: boolean;
	workspaceExcludePatterns: string[];
	swapBigAndSmallImage: boolean;
	removeDetails: boolean;
	removeLowerDetails: boolean;
	removeTimestamp: boolean;
	removeRemoteRepository: boolean;
	idleTimeout: number;
};

export function getConfig() {
	return workspace.getConfiguration('discord') as WorkspaceExtensionConfiguration;
}

export const toLower = (str: string) => str.toLocaleLowerCase();

export const toUpper = (str: string) => str.toLocaleUpperCase();

export const toTitle = (str: string) => toLower(str).replace(/^\w/, (c) => toUpper(c));

export function resolveFileIcon(document: TextDocument) {
	const filename = basename(document.fileName);
	const findKnownExtension = Object.keys(KNOWN_EXTENSIONS).find((key) => {
		if (filename.endsWith(key)) {
			return true;
		}

		const match = /^\/(.*)\/([mgiy]+)$/.exec(key);
		if (!match) {
			return false;
		}

		const regex = new RegExp(match[1], match[2]);
		return regex.test(filename);
	});
	const findKnownLanguage = KNOWN_LANGUAGES.find((key) => key.language === document.languageId);
	const fileIcon = findKnownExtension
		? KNOWN_EXTENSIONS[findKnownExtension]
		: findKnownLanguage
		? findKnownLanguage.image
		: null;

	return typeof fileIcon === 'string' ? fileIcon : fileIcon?.image ?? 'text';
}

export async function getGit() {
	if (git || git === null) {
		return git;
	}

	try {
		log(LogLevel.Debug, 'Loading git extension');
		const gitExtension = extensions.getExtension<GitExtension>('vscode.git');
		if (!gitExtension?.isActive) {
			log(LogLevel.Trace, 'Git extension not activated, activating...');
			await gitExtension?.activate();
		}
		git = gitExtension?.exports.getAPI(1);
	} catch (error) {
		git = null;
		log(LogLevel.Error, `Failed to load git extension, is git installed?; ${error as string}`);
	}

	return git;
}

export async function resolveFileIcon2({ fileName, languageId }: TextDocument) {
	//get the file icon theme metadata
	const icon_theme: string = workspace.getConfiguration().get('workbench.iconTheme')!;
	//log(LogLevel.Debug, icon_theme);
	const { id, extensionPath, packageJSON } = extensions.all.find((extension) => extension.id.includes(icon_theme))!;
	const [author, name] = id.toLowerCase().split('.');

	const { fileNames, fileExtensions, languageIds, iconDefinitions } = JSON.parse(
		Buffer.from(
			await workspace.fs.readFile(
				Uri.file(join(normalize(extensionPath), normalize(packageJSON.contributes.iconThemes[0].path)))
			)
		).toString('utf-8')
	);
	//everything above comment should be isolated to exports for performance

	fileName = basename(fileName).toLowerCase();
	const fileExtension = fileName.split('.').slice(1).join('.');
	let iconType = null;

	//the following is in reverse to maintain order of preference
	//check file language
	log(LogLevel.Debug, `Checking file language: ${languageId}`);
	if (languageId in languageIds) iconType = languageIds[languageId];
	// log(LogLevel.Debug, `res: ${languageId in languageIds} icon: ${iconType}`);
	//check file extension
	log(LogLevel.Debug, `Checking file extension: ${fileExtension}`);
	if (fileExtension in fileExtensions) iconType = fileExtensions[fileExtension];
	// log(LogLevel.Debug, `res: ${fileExtension in fileExtensions} icon: ${iconType}`);
	//check file name
	log(LogLevel.Debug, `Checking file name: ${fileName}`);
	if (fileName in fileNames) iconType = fileNames[fileName];
	// log(LogLevel.Debug, `res: ${fileName in fileNames} icon: ${iconType}`);

	const iconUrl =
		'https://vercel-svg-to-png.vercel.app/api/convert?' +
		new URLSearchParams({
			img: encodeURIComponent(
				`https://${author}.vscode-unpkg.net/${author}/${name}/${packageJSON.version}/extension/icons/${iconDefinitions[
					iconType
				].iconPath
					.split('/')
					.pop()}`
			),
			size: '1024',
			pad: '0.32',
		}).toString();
	log(LogLevel.Debug, iconUrl);
	return [iconUrl, iconType];
}
