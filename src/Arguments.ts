import { isNumber, ScalarValue } from "@zouloux/ecma-core";

// ----------------------------------------------------------------------------- TODO / TESTS

/**
 * TODO : Manage flags without equal
 * TODO : 	- "--port 3000" should work as well as "--port=3000"
 * TODO :	- For now it will enable "--port" as true and add an argument of value "3000"
 *
 * TODO : Manage concat shortcuts correctly
 * TODO : 	- "-abc" should enable "-a" "-b" and "-c"
 * TODO : 	- For now its detected as "abc" to be true
 */

// node arguments.js --dev -p -a=1 -a=2 -a=false --attention=5 -t=12 test test2 "super test" --ok-dac
/*
 const args = parseArguments({
 alias: {
 d: 'dev',
 a: 'attention'
 }
 })
 console.log( args );
 */

// ----------------------------------------------------------------------------- STRUCT

export type TFlagValue = ScalarValue | (ScalarValue[])

interface IParseArgumentsOptions {
	/**
	 * Alias flags
	 * {
	 *     p: 'port'
	 * }
	 * Flag "-p" will be aliased to "--port"
	 */
	flagAliases		:Record<string, string>
	/**
	 * Arguments to parse. Defaults to process.argv
	 */
	argv			:string[]
	/**
	 * Default flag values.
	 */
	defaultFlags 	:Record<string, TFlagValue>
}

export interface IParsedArguments {
	platform		:string
	script			:string
	flags			:Record<string, TFlagValue>
	arguments		:string[]
}

// ----------------------------------------------------------------------------- PARSE ARGUMENTS

/**
 * Will convert process.argv to a list of argument and flags with correct type.
 * Here are IParsedArguments named values :
 * `platform ./script.js -f --flag argument1 argument2 --otherFlag=false --array=1 --array=2`
 * @see IParseArgumentsOptions
 * @see IParsedArguments
 * TODO : Better doc
 */
export function parseArguments ( options?:Partial<IParseArgumentsOptions> ):IParsedArguments {
	// Compute default options
	options = {
		flagAliases: {},
		defaultFlags: {},
		...options,
	}
	const parts = options.argv ?? process.argv
	// Output
	const parsed:IParsedArguments = {
		platform	: parts.shift(),
		script		: parts.shift(),
		flags		: {},
		arguments	: [],
	}
	// Browse and parse parts
	parts.forEach( part => {
		part = part.trim()
		// Check if this is an argument and not a flag
		if ( !part.startsWith('-') && !part.startsWith('--') ) {
			parsed.arguments.push( part )
			return;
		}
		// Get key between dashes and equal sign
		const separator = part.startsWith('--') ? '--' : '-'
		let key = part.split( separator )[1].split("=")[0].trim()
		// Convert key if this is an alias
		if ( options.flagAliases && key in options.flagAliases )
			key = options.flagAliases[ key ]
		// Get value ( after equals, default to true if no equal sign )
		let value:ScalarValue = (
			part.indexOf("=") !== -1
			? part.split("=", 2)[1]
			: true
		)
		if ( typeof value === "string" ) {
			// Trim value here, we know for sure it's a string
			value = value.trim()
			// Convert value to number if a number is detected
			if ( isNumber( value ) )
				value = parseFloat( value )
			// Check if boolean-like values like "true" and "FALSE"
			else {
				const lower = value.toLowerCase()
				if ( lower === "true" )
					value = true
				else if ( lower === "false" )
					value = false
			}
		}
		// Check if there are several flags with this key
		if ( key in parsed.flags ) {
			// Convert flag to array
			if ( !Array.isArray(parsed.flags[key]) )
				parsed.flags[ key ] = [ parsed.flags[ key ] as ScalarValue ]
			// Push new value
			;(parsed.flags[ key ] as ScalarValue[] ).push( value )
		}
		// Set flag value
		else {
			parsed.flags[ key ] = value
		}
	})
	// Default flags after to avoid array on default flags
	Object.keys(options.defaultFlags).forEach( key => {
		if ( !(key in parsed.flags ) )
			parsed.flags[ key ] = options.defaultFlags[ key ]
	})

	return parsed
}