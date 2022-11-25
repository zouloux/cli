import { IParsedArguments, parseArguments, TFlagValue } from "./Arguments";

// ----------------------------------------------------------------------------- STRUCT

type TArgs = string[]
type TFlags = Record<string, TFlagValue>

export type TCommandHandler <GFlags extends TFlags = TFlags> =
	( args?:TArgs, flags?:GFlags, commandName?:string ) => any|Promise<any>

export type TCommandStartHandler <GFlags extends TFlags = TFlags> =
	( commandName:string, error:CommandError, args:TArgs, flags?:GFlags, results?:any[] ) => any|Promise<any>

interface IRegisteredCommand <GFlags extends TFlags = TFlags>  {
	name				:string,
	handlers			:TCommandHandler<GFlags>[]
}

// Custom CommandError to be able to detect commands not found
class CommandError extends Error { }

// ----------------------------------------------------------------------------- CLI COMMANDS

export class CLICommands <GFlags extends TFlags = TFlags> {

	// All registered commands
	protected _registeredCommands	:Record<string, IRegisteredCommand> = {};

	// Get parsed args
	protected _parsedArgs			:IParsedArguments
	get parsedArgs ():IParsedArguments { return this._parsedArgs }

	// Handlers executed before actions after start
	protected _beforeHandlers		:TCommandHandler[] = []

	/**
	 * Create a new CLI command entity.
	 * Will parse arguments when instantiated.
	 * Do not forget to call start() to run the commands !
	 * @param defaultFlags Default flag values ( @see parseArguments )
	 * @param flagAliases Flag aliases ( @see parseArguments )
	 * @param argv CLI arguments to parse, default to process.argv
	 */
	constructor ( defaultFlags?:GFlags, flagAliases?:Record<string, string>, argv?:string[] ) {
		this._parsedArgs = parseArguments({
			defaultFlags, flagAliases, argv
		})
	}

	/**
	 * Register a command.
	 * Will replace if command name already exists.
	 * Use CLICommands.exists( commandName ) to avoid override.
	 * @param name Name of the command or list of commands.
	 * @param handler Handler called with options as first argument.
	 */
	add ( name:string|string[], handler:TCommandHandler<GFlags> )
	{
		// Same command can have multiple name with aliases
		(typeof name === "string" ? [name] : name).map( n => {
			n = n.toLowerCase();
			// Merge if already this command name already exists
			const alreadyRegisteredConfig = (
				n in this._registeredCommands ? this._registeredCommands[ n ] : {}
			) as IRegisteredCommand;
			this._registeredCommands[ n ] = {
				name: n,
				handlers: [
					...(alreadyRegisteredConfig.handlers ?? []),
					handler
				],
				//help: alreadyRegisteredConfig.help ?? {}
			};
		})
	}

	/**
	 * Add an handler which will be executed before all commands when calling start.
	 * Handlers will be executed in added order.
	 * Return false to halt command executions.
	 * @param handler A command handler
	 */
	before <G extends object> ( handler:TCommandHandler<GFlags> ) {
		this._beforeHandlers.push( handler )
	}

	/**
	 * Get registered commands list
	 */
	list () {
		return Object.keys( this._registeredCommands )
	}

	/**
	 * Check if a command exists
	 */
	exists ( commandName:string ) {
		return Object.keys( this._registeredCommands ).indexOf( commandName ) !== -1
	}

	/**
	 * Run any registered command.
	 * Will make a loose check if command is not found
	 * ( will accept command starting with commandName )
	 * @param commandName Lowercase command name.
	 * @param args Arguments passed to command
	 * @param flags Flags passed to command
	 */
	async run ( commandName:string, args:TArgs, flags:GFlags )
	{
		// Throw if command does not exists
		let selectedCommand;
		if ( commandName in this._registeredCommands )
			selectedCommand = commandName;
		else {
			// Try loose check
			Object.keys( this._registeredCommands ).map( command => {
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
		const command = this._registeredCommands[ selectedCommand ];
		// Execute command with flags on top of default flags
		const results = [];
		for ( const handler of command.handlers )
			results.push(
				await handler( args, flags, commandName )
			);
		return results;
	}

	/**
	 * Start parsing arguments and run command with flags
	 * @param defaultHandler Called when command has not been found.
	 * @returns {Promise<void>}
	 */
	async start ( defaultHandler?:TCommandStartHandler ) {
		// Get arguments from CLI
		let commandName = this._parsedArgs.arguments[ 0 ]
		const args = this._parsedArgs.arguments.slice( 1 )
		const flags = this._parsedArgs.flags as GFlags
		let results = [];
		let error:CommandError = null;
		// Call all before handlers, halt if any before returns false
		for ( const handler of this._beforeHandlers )
			if ( await handler( args, flags, commandName ) === false )
				return;
		// If we have a command to start
		if ( commandName ) {
			// Try to run
			try {
				results = await this.run( commandName, args, flags );
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
			await defaultHandler( commandName, error, args, flags, results );
		// Otherwise throw raised error
		else if ( error )
			throw error
	}
}
