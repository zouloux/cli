
// ----------------------------------------------------------------------------- STRUCT

export type TCommandHandler<G extends object> = ( cliArguments?:string[], cliOptions?:G, commandName?:string ) => any|Promise<any>

export type TCommandDefaultHandler = ( commandName:string, error:CommandError, cliArguments:string[], cliOptions?:object, results?:any[] ) => any|Promise<any>

export interface ICommandArguments {
	[key:string] : string
}

// Custom CommandError to be able to detect commands not found
class CommandError extends Error { }

// ----------------------------------------------------------------------------- ARGV

// Cached args and options
// TODO : To global so several version of cli can have the same register
let _argsAndOptionsCache;

/**
 * Get parsed arguments from CLI.
 * Results are in cache.
 * As a tuple : [ arguments, options ]
 * Ex :
 */
export function getCLIArguments () : [string[], object]
{
	// Parse and put to cache
	if ( !_argsAndOptionsCache ) {
		const mri = require('mri');
		const argv = process.argv.slice(2);
		const parsedArgs = mri( argv );

		// Separate arguments and options
		const args = parsedArgs._ ?? [];
		delete parsedArgs._;
		_argsAndOptionsCache = [args, parsedArgs]
	}

	// Return cached as a tuple
	// [ arguments, options ]
	return _argsAndOptionsCache
}

// ----------------------------------------------------------------------------- CLI COMMANDS

// All parsed args and list of commands
let _registeredCommands = {};

// List of all handlers ran before commands
let _beforeHandlers:TCommandHandler<object>[] = []

export const CLICommands = {

	/**
	 * Register a command.
	 * Will replace if command name already exists.
	 * Use CLICommands.exists( commandName ) to avoid override.
	 *
	 * @param name Name of the command or list of commands.
	 * @param handler Handler called with options as first argument.
	 * @param options Default options of the command.
	 * @param commandArguments Handler called with options as first argument.
	 */
	add <G extends object> ( name:string|string[], handler:TCommandHandler<G>, options:G = {} as any, commandArguments:ICommandArguments = {} )
	{
		(typeof name === "string" ? [name] : name).map( n => {
			n = n.toLowerCase();
			const alreadyRegisteredConfig = (
				n in _registeredCommands ? _registeredCommands[ n ] : {}
			);

			_registeredCommands[ n ] = {
				name: n,
				options: {
					...(alreadyRegisteredConfig.options ?? {}),
					...options
				},
				commandArguments: {
					...(alreadyRegisteredConfig.commandArguments ?? {}),
					...commandArguments
				},
				handlers: [
					...(alreadyRegisteredConfig.handlers ?? []),
					handler
				],
				help: alreadyRegisteredConfig.help ?? {}
			};
		})
	},

	/**
	 * Add an handler which will be executed before all commands when calling start.
	 * Handlers will be executed in added order.
	 * Return false to halt command executions.
	 * @param handler A command handler
	 */
	before <G extends object> ( handler:TCommandHandler<G> ) {
		_beforeHandlers.push( handler )
	},

	// TODO
	// addHelp ( name:string|string[], group:string, message:string, options : {[index:string] : string} = {})
	// {
	// 	( typeof name === "string" ? [name] : name ).map( n => {
	// 		n = n.toLowerCase();
	// 		if ( !( n in _registeredCommands) ) return; // fixme : error ?
	// 		_registeredCommands[ n ].help = { group, message, options };
	// 	});
	// },

	/**
	 * Get registered commands list
	 */
	list () { return Object.keys( _registeredCommands ); },

	/**
	 * Check if a command exists
	 */
	exists ( commandName:string ) {
		return Object.keys( _registeredCommands ).indexOf( commandName ) !== -1
	},

	/**
	 * Start parsing arguments and run command with options
	 * @param defaultHandler Called when command has not been found.
	 * @returns {Promise<void>}
	 */
	async start ( defaultHandler?:TCommandDefaultHandler )
	{
		// Get arguments from CLI
		const [ cliArguments, cliOptions ] = getCLIArguments();

		let commandName = ''
		let results = [];
		let error:CommandError = null;

		// Get command name
		if ( cliArguments.length > 0 ) {
			// Get command name
			commandName = cliArguments[ 0 ].toLowerCase();

			// Remove command name from _ args
			cliArguments.shift();
		}

		// Call all before handlers, halt if any before returns false
		for ( const handler of _beforeHandlers )
			if ( await handler( cliArguments, cliOptions, commandName ) === false )
				return;

		// If we have a command to start
		if ( commandName ) {
			// Try to run
			try {
				results = await this.run( commandName, cliArguments, cliOptions );
			}
			catch ( e ) {
				// Start default handler if command has not been found
				if ( e instanceof CommandError )
					error = e;
				// Throw all other errors
				else
					throw e
			}
		}

		// Call default handler
		if ( defaultHandler )
			await defaultHandler( commandName, error, cliArguments, cliOptions, results );

		// Otherwise throw raised error
		else if ( error )
			throw error
	},

	/**
	 * Run any registered command.
	 * Will make a loose check if command not found
	 * ( will accepted command starting with commandName )
	 * @param commandName Lowercase command name.
	 * @param cliArguments List of arguments passed to CLI
	 * @param cliOptions List of options passed to CLI, with defaults
	 * @returns {Promise<*>}
	 */
	async run ( commandName, cliArguments, cliOptions )
	{
		// Throw if command does not exists
		let selectedCommand;
		if ( commandName in _registeredCommands )
			selectedCommand = commandName;

		else
		{
			// Try loose check
			Object.keys( _registeredCommands ).map( command => {
				// Do not continue if we found
				if ( selectedCommand ) return;

				// Check loose (starting like) and with lowercase check
				if ( command.toLowerCase().indexOf( commandName.toLowerCase() ) === 0 )
					selectedCommand = commandName
			});

			// Not found, even with loose, we throw
			if ( !selectedCommand )
				throw new CommandError(`Command ${commandName} not found`);
		}

		// Get command
		const command = _registeredCommands[ selectedCommand ];

		// Execute command with options on top of default options
		const results = [];
		// console.log('--', command.handlers);
		for ( const handler of command.handlers ) {
			results.push(
				await handler(cliArguments, {
					...command.options,
					...cliOptions
				}, command.name)
			);
		}
		return results;
	},

	// TODO
	// showHelp ()
	// {
	// 	// TODO : Show nice help
	// },
	//
	// promptAvailableCommands ()
	// {
	// 	// TODO : Show all available commands in a selectable list
	// }
};

