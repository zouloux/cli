import * as child_process from "child_process";
import { ChildProcess, ExecSyncOptions, SpawnOptions } from "child_process";
import { spawn } from 'child_process'

// ----------------------------------------------------------------------------- STRUCT

type TVerboseLevel = boolean|number|"out"|"err"|"in";

export interface IExecStreamOptions extends SpawnOptions {
	encoding?:BufferEncoding
}

type TExecStreamOutputHandler = (stdout?:string, stderr?:string, stdoutBuffer?:string, stderrBuffer?:string, childProcess?:ChildProcess) => any|void

export interface IExecStreamResult
{
	stdout		:string
	stderr		:string
	code		:number
}

// ----------------------------------------------------------------------------- EXEC UTILITIES

/**
 * Exec a command async and resolve stdout as string.
 * By default stdout and stderr are hidden.
 * Set stdLevel to show stdout and / or stderr.
 * Options argument can be collapsed onto stdlevel argument.
 * @param command Command to execute.
 * @param verboseLevel standard outputs to use. 0 is none, 1 is only stdout, 2 is only stderr, 3 is stdout and stdin.
 * @param options See child_process.exec options. Ignore to call and hide command's stdout.
 * @returns Promise with stdout if success, stderr if fail
 */
export const execAsync = ( command:string, verboseLevel:TVerboseLevel = 0, options:ExecSyncOptions = null ) => new Promise( (resolve, reject) =>
{
	// Call command with default options
	const childProcess = child_process.exec(
		command, options,
		( error, stdout, stderr) => {
			error
			? reject( (stderr ?? '').toString() )
			: resolve( (stdout ?? '').toString() )
		}
	);

	// Go to stdout
	if ( verboseLevel === true || verboseLevel === 1 || verboseLevel === 3 || verboseLevel == 'out' ) {
		// @ts-ignore
		childProcess.stdout.pipe( process.stdout );
	}

	// Go to stderr
	if ( verboseLevel === true || verboseLevel === 2 || verboseLevel === 3 || verboseLevel == 'err' ) {
		// @ts-ignore
		childProcess.stderr.pipe( process.stderr );
	}

	// Pipe stdin
	if ( verboseLevel === 3 || verboseLevel == 'in' ) {
		process.stdin.pipe( childProcess.stdin )
	}
});

/**
 * Exec a command and return stdout as string.
 * By default stdout and stderr are hidden.
 * Set stdLevel to show stdout and / or stderr.
 * Options argument can be collapsed onto stdlevel argument.
 * @param command Command to execute.
 * @param verboseLevel standard outputs to use. 0 is none, 1 is only stdout, 2 is only stderr, 3 is stdout and stdin.
 * @param options See child_process.execSync options. Ignore to call and hide command's stdout.
 * @returns Stringified result of command's stdout
 */
export function execSync ( command:string, verboseLevel:TVerboseLevel = 0, options:ExecSyncOptions = null ):string
{
	try {
		// Call command with default options
		let result = child_process.execSync( command, options );

		// Convert to string
		const resultString = (result ?? '').toString();

		// Go to stdout if needed
		if ( resultString && (verboseLevel === true || verboseLevel === 1 || verboseLevel === 3 || verboseLevel == 'out') )
			process.stdout.write( resultString );

		// Return string result
		return resultString;
	}
	catch ( error ) {
		const resultString = (error.stdout ?? '').toString();
		if ( verboseLevel === true || verboseLevel === 1 || verboseLevel === 3 || verboseLevel == 'out')
			process.stdout.write( resultString );

		if ( verboseLevel === true || verboseLevel === 2 || verboseLevel === 3 || verboseLevel == 'err')
			process.stderr.write( (error.stderr ?? '').toString() );

		// Return string result
		return resultString;
	}
}

/**
 * Exec and stream all outputs to an handler.
 * @param command Command to exec as string
 * @param spawnOptions Options bag to give to Node Spawn
 * @param outputHandler Executed each time child process output something in stdout or stderr
 */
export async function execStream (command:string, spawnOptions:IExecStreamOptions, outputHandler:TExecStreamOutputHandler):Promise<IExecStreamResult>
{
	return new Promise( (resolve, reject) => {
		// Default options
		if ( !spawnOptions )
			spawnOptions = {}
		if ( !spawnOptions.encoding )
			spawnOptions.encoding = 'utf8'

		// Spawn process
		const childProcess = spawn( command, [], {
			...spawnOptions,
			shell: true // Force command in one string
		});

		// Set encodings
		childProcess.stdout.setEncoding( spawnOptions.encoding );
		childProcess.stderr.setEncoding( spawnOptions.encoding );

		// Init buffers
		let stdoutBuffer = ''
		let stderrBuffer = ''

		// Listen stdout
		childProcess.stdout.on('data', data => {
			data = data.toString()
			stdoutBuffer += data
			outputHandler && outputHandler(data, null, stdoutBuffer, stderrBuffer, childProcess)
		});

		// Listen stderr
		childProcess.stderr.on('data', data => {
			data = data.toString()
			stderrBuffer += data
			outputHandler && outputHandler(null, data, stdoutBuffer, stderrBuffer, childProcess)
		});

		// Listen close and cose
		childProcess.on('close', code => {
			const output = {
				stdout: stdoutBuffer,
				stderr: stderrBuffer,
				code
			}
			code === 0 ? resolve( output ) : reject( output )
		});
	})
}

// ----------------------------------------------------------------------------- LIFECYCLE UTILISES

function _listenOnProcess ( handler, eventsToListen  ) {
	eventsToListen.forEach( eventType => {
		process.on(eventType, async (...rest) => {
			await handler( eventType, ...rest );
		});
	})
}

/**
 * Listen all events when parent process is killed or user tries to kill process.
 * Process will hang while promises are running.
 * Useful to clean before closing or interrupt use trying to close process.
 * Use onProcessWillExit if you want to hook just before process is closing.
 * Use onProcessError to catch uncaught exception and unhandled rejections.
 * @param handler Called with event name as first argument
 * @param eventsToListen All codes to listen on process.
 */
export function onProcessKilled (
	handler: (eventType:string, ...rest) => any,
	eventsToListen = ['SIGINT', 'SIGUSR1', 'SIGUSR2', 'SIGTERM']
) {
	_listenOnProcess( handler, eventsToListen )
}

/**
 * Listen program errors like unhandled rejections and uncaught exceptions.
 * @param handler Called with event name as first argument
 * @param eventsToListen All codes to listen on process.
 */
export function onProcessError (
	handler: (eventType:string, ...rest) => any,
	eventsToListen = ['uncaughtException', 'unhandledRejection']
) {
	_listenOnProcess( handler, eventsToListen )
}

/**
 * Listen when node will exit.
 * This will be called even if exit cause is process.exit() usage or if program simply ends.
 * Please call process.exit after usage to avoid unkillable process, only once.
 */
export function onProcessWillExit ( handler:(...rest) => any ) {
	_listenOnProcess( handler, ['exit'] )
}