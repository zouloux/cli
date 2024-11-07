import ora, { Options as OraOptions } from "ora";
import { execStream, IExecStreamOptions, IExecStreamResult } from "./Process";
import { newLine, nicePrint, printLine } from "./Output";
const chalk = require('chalk');

// -----------------------------------------------------------------------------

// https://www.npmjs.com/package/ora
interface IOraTaskOptions extends OraOptions
{
	text		:string
	afterText	:string
	successText	:string
	errorText	:string
	progress	:[number, number, number]
}

interface ITaskUpdater
{
	setText (text?:string)
	setAfterText (text?:string, limit?:number)
	setProgress (value:number, total?:number, width?:number)
	clearProgress ()
	success (text?:string, after?:string)
	error (text?:string, after?:string)
	warning (text?:string, after?:string)
	info (text?:string, after?:string)
	updateLoader ()
	getText ():string
}

interface IOraExecError extends IExecStreamResult {
	taskUpdater	:ITaskUpdater,
}

// ----------------------------------------------------------------------------- PRINT REMOVABLE LINE

// Name of the current executing loader scope.
// This will be shown in grey in every solid log
let _currentLoaderScope:string = null

/**
 * Name of current loader scope.
 * Will be shown in grey with printLoaderLine.
 * @param scope null to remove
 */
export function setLoaderScope ( scope:string|null ) {
	_currentLoaderScope = scope;
}

// We count how many lines we draw to clear all after each watch build
const _lineCountersByScope = {};

// Create a log template for loader scope
export const generateLoaderLineTemplate = ( c, i = '' ) => {
	return nicePrint((
		_currentLoaderScope !== null
			? `${i} {l}${_currentLoaderScope} -{/} ${c}`
			: `${i} ${c}`
	), {
		output: 'return',
		newLine: false,
		replaceTabs: false
	})
}

/**
 * Clear all printed solid lines for current loader scope
 * @param linesToClear Override total lines to clear. Let null for automatic.
 */
export function clearPrintedLoaderLines ( linesToClear:number = null ) {

	if ( linesToClear !== null )
		_lineCountersByScope[_currentLoaderScope] = linesToClear;

	if ( _currentLoaderScope in _lineCountersByScope )
		for ( let i = 0; i < _lineCountersByScope[_currentLoaderScope]; i++ ) {
			process.stdout.cursorTo(0, -1)
			process.stdout.clearLine(0);
		}

	_lineCountersByScope[ _currentLoaderScope ] = 0;
}

/**
 * Print a loader like log, current scope shown in grey if multiple apps.
 * Content can be nicePrint formatted.
 */
export function printLoaderLine ( content:string, oraOptions? )
{
	// Init line count for this app name
	if ( !(_currentLoaderScope in _lineCountersByScope) )
		_lineCountersByScope[ _currentLoaderScope ] = 0;

	// Add a line
	_lineCountersByScope[ _currentLoaderScope ] += 1;

	// Format, print line and get clear function
	const renderedTemplate = generateLoaderLineTemplate( content );
	// const strLen = stripAnsi( renderedTemplate ).length + 3;
	const loader = ora( renderedTemplate ).start( oraOptions );

	// Return clear function to override previous line
	return ( content?:string, statusOrIcon:"ok"|"success"|"error"|"warning"|"info"|string = "ok" ) => {
		// No content, just stop loader
		if (!content) {
			loader.stop();
			return;
		}

		// Ora loader icon
		if ( statusOrIcon == 'ok' )
			loader.succeed( generateLoaderLineTemplate(content) )
		else if ( statusOrIcon == 'success' )
			loader.succeed( generateLoaderLineTemplate(chalk.bold.green(content)) )
		else if ( statusOrIcon == 'error' )
			loader.fail( generateLoaderLineTemplate(chalk.bold.red(content)) )
		else if ( statusOrIcon == 'warning' )
			loader.warn( generateLoaderLineTemplate(chalk.bold.keyword('orange')(content)) )
		else if ( statusOrIcon == 'info' )
			loader.info( generateLoaderLineTemplate(chalk.grey.content) )

		// Show custom icon
		else {
			loader.stop();
			printLine( generateLoaderLineTemplate(content, statusOrIcon) );
			newLine();
		}
	}
}

// ----------------------------------------------------------------------------- ORA TASK

/**
 * TODO : DOC
 */
export function oraTask ( taskOptions:Partial<IOraTaskOptions>|string, handler:(taskUpdater?:ITaskUpdater) => any|void ) {
	const options:Partial<IOraTaskOptions> = (
		( typeof taskOptions === "string" )
		? { text: taskOptions }
		: taskOptions
	)
	return new Promise( async (resolve, reject) => {
		const loader = ora( options )
		loader.start();
		const textAndAfter = ( text:string, after?:string ) => (
			after
			? nicePrint(`${text}{d} - ${after}`, { output: 'return' })
			: text
		)
		const taskUpdater:ITaskUpdater = {
			// Text and after text
			setText ( text:string ) {
				options.text = text
				this.updateLoader();
			},
			setAfterText ( text:string, limit = 0 ) {
				if ( limit > 0 && text.length > limit )
					text = text.substr(0, limit) + ' ...'
				options.afterText = text
				this.updateLoader();
			},
			// Progress
			setProgress ( value, total = 1, width = 20 ) {
				options.progress = [ value, total, width ]
				this.updateLoader();
			},
			clearProgress () {
				options.progress = null
				this.updateLoader();
			},
			// End
			success ( text, after?:string ) {
				loader.succeed( textAndAfter(text, after) )
			},
			error ( text, after?:string ) {
				loader.fail( textAndAfter(text, after) )
			},
			warning ( text, after?:string ) {
				loader.warn( textAndAfter(text, after) )
			},
			info ( text, after?:string ) {
				loader.info( textAndAfter(text, after) )
			},
			// Update state
			updateLoader () {
				let text = options.text
				// Add progress bar
				if ( options.progress ) {
					const { progress } = options
					text += ' '
					for ( let i = 0; i < progress[2]; i ++)
						text += ( progress[0] / progress[1] > i / progress[2] ) ? '█' : '░';
				}
				// Add dimmed after text
				if ( options.afterText ) {
					text += nicePrint(`{d}${options.progress ? ' ' : ' - '}${options.afterText}`, { output: 'return' })
				}
				loader.text = text
			},
			getText () {
				return options.text
			}
		}
		try {
			const result = await handler( taskUpdater );
			if ( options.successText )
				loader.succeed( options.successText )
			else
				loader.stop();
			resolve( result );
		}
		catch ( e ) {
			options.errorText && loader.fail( options.errorText )
			if ( e instanceof Object )
				reject({ ...e, taskUpdater })
			else
				reject({
					taskUpdater,
					error: e
				});
		}
	})
}

// ----------------------------------------------------------------------------- ORA EXEC

/**
 * TODO : DOC
 */
export async function oraExec ( command:string, spawnOptions?:IExecStreamOptions, taskOptions?:Partial<IOraTaskOptions>, errorHandler?:(e:IOraExecError) => any|void ) {
	try {
		return await oraTask(taskOptions, async ( taskUpdater ) => {
			return execStream(command, null, (stdout, stderr) => {
				stdout && taskUpdater.setAfterText( stdout )
				stderr && taskUpdater.setAfterText( stderr )
			})
		})
	}
	catch ( error ) {
		if ( errorHandler )
			return errorHandler( error )

		if ( error.stderr )
			nicePrint(`{b/r}${error.stderr}`)
		else if ( error.stdout )
			nicePrint(`{b/r}${error.stdout}`)

		error.code >= 0 && process.exit( error.code )
	}
}