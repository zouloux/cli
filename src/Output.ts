import { untab, indent, repeat } from "@zouloux/ecma-core";
const chalk = require('chalk');
import stripAnsi from 'strip-ansi';
import { execSync } from "child_process";

/**
 * Size of a tab for every CLI function.
 * Can be changed
 */
export let cliTabSize = 3;

// ----------------------------------------------------------------------------- PRINT UTILITIES

/**
 * Print to output with process.stdout, without using console log.
 * @param content Content to print
 * @param newLine New line, default is \n\r, can be false to disable new line.
 */
export function print ( content:string, newLine:string|boolean = "\n\r" ) {
	process.stdout.write( content );
	newLine && process.stdout.write( newLine as string );
}

/**
 * Print a new line
 */
export function newLine () { process.stdout.write('\r\n'); }

// ----------------------------------------------------------------------------- PRINT REMOVABLE LINE

/**
 * Print a removable line.
 * Will return a handler to change content of printed line.
 * Ex : let line = printLine('Hello, I will be removed')
 *      line = line('This text replace previous text')
 *      line = line('And again')
 *      line('And again ...', true) // will erase and go next line
 * @param content Content to print. Nice printed with nicePrint.
 * @returns a handler to re-print the line, recursively.
 */
export function printLine ( content:string )
{
	// Nicely print and measure how many chars without ansi markers
	const niceContent = nicePrint( content, { output:'return', newLine: false } );
	const strLen = stripAnsi( niceContent ).length;

	print( niceContent, null );

	// Return handler to remove previously printed line
	return ( newContent:string, last = true ) => {
		// Remove previous line by repeating space all over previous chars
		process.stdout.cursorTo( 0 );
		print( repeat( strLen ), null );
		process.stdout.cursorTo( 0 );

		// Last line, line jump
		if ( last ) {
			printLine( newContent )
			newLine();
			return null;
		}

		// Print new line and return handler recursively
		return printLine( newContent );
	}
}

// ----------------------------------------------------------------------------- NICE PRINT

export type TNicePrintOutput = 'stdout'|'stderr'|'return';

export interface INicePrintOptions
{
	newLine		:string|null|boolean
	output		:TNicePrintOutput,
	code		:number
	untab		:"auto"|"last"|number|false
	replaceTabs	:boolean
}

const _nicePrintStyleReplacerRegex = /\{([a-z]*\/?[a-z]+)\}([^{]*)(\{\/\})?/gi;

export const nicePrintFormatters = {
	// Style formatters
	'bold'		: chalk.bold,
	'underline'	: chalk.underline,
	'strike'	: chalk.strikethrough,
	'italic'	: chalk.italic,
	'dim'		: chalk.dim,

	// Color formatters
	'red'		: chalk.red,
	'yellow'	: chalk.yellow,
	'cyan'		: chalk.cyan,
	'blue'		: chalk.blue,
	'green' 	: chalk.greenBright,
	'purple'	: chalk.keyword('purple'),
	'orange'	: chalk.keyword('orange'),
	'grey'		: chalk.gray,
	'lite'		: chalk.gray,
	'white'		: chalk.white,

	// Special formatters
	'invert' 	: chalk.inverse,
};

function styleReplacer ( from:string, identifier:string, content )
{
	//console.log('>', {from, value: identifier, content});

	// Identifier is just slash, this is a close tag {/}
	if ( identifier == '/' )
		return chalk.reset()

	// Split identifiers
	const split = identifier.toLowerCase().split('/');

	// Get chained list of formatters from identifier
	let formattersChain = [];
	split.map( marker => {
		for ( const key of Object.keys(nicePrintFormatters) ) {
			if ( key.indexOf( marker ) !== 0 ) continue;
			formattersChain.push(  nicePrintFormatters[ key ] );
			break;
		}
	})

	// Execute all formatters in chain like so :
	// Ex : chalk.bold( chalk.italic( chalk.red( content ) ) )
	return formattersChain.reduce( (previous, current) => current( previous ), content);
}

/**
 * Print nice templated string to CLI.
 * See example to understand how to mark your text to format it :
 *
 * Ex : nicePrint(`
 * 		{bold}I'm a text in bold
 * 		Regular text
 * 		{italic}Text in italic{/} and regular text
 * 		{red/bold}Red and bold {orange}Orange and bold
 * 		{y/b}Yellow and bold
 * `)
 *
 * See nicePrintFormatters to check all available keys. You can add yours like so :
 * Ex : nicePrintFormatters['fushia'] = chalk.keywork('fushia')
 *
 * @param template Template string to print or return nicely.
 * @param options See @INicePrintOptions
 */
export function nicePrint ( template:string, options:Partial<INicePrintOptions> = {} )
{
	options = {
		newLine: "\n",
		output: 'stdout',
		code: 0,
		untab: "last",
		replaceTabs: true,
		...options
	};

	// Untab
	if ( options.untab !== false )
		template = untab( template, options.untab )

	// Process nice print templating with styleReplacer()
	const lines = template.split("\n").map( line =>
		line.replace(_nicePrintStyleReplacerRegex, styleReplacer)
	)

	// Add reset at each end of line and add line jumps
	let content = lines.join( chalk.reset() + "\n" )

	// Replace all tabs by spaces
	if ( options.replaceTabs )
		content = content.replace(/\t/gmi, indent(1, '', cliTabSize));

	// Add new line
	if ( options.newLine )
		content += options.newLine;

	// Go to stdout
	if ( options.output == 'stdout')
		process.stdout.write( content );

	// Go to stderr
	else if ( options.output == 'stderr' )
		process.stderr.write( content );

	// Exit if we have an error code
	options.code > 0 && process.exit( options.code );
	return content;
}

// ----------------------------------------------------------------------------- CLI UTILITIES

/**
 * Show a big old banner
 */
export function banner ( title:string, width = 78, margin = 1, padding = 2 )
{
	const marginBuffer = repeat( margin );
	const line = marginBuffer + chalk.bgWhite( repeat( width ) );
	print( line );
	print( marginBuffer + chalk.bgWhite.black( repeat( padding ) + title + repeat( width - padding - title.length )) );
	print( line );
}

/**
 * Print a nice table in stdout
 * @param lines Two dimensions array to show as table. First dimension are lines, second dimensions are columns.
 * @param firstLineAreLabels Show first line in bold
 * @param minColumnWidths Default min widths for every columns ( for example : [ 10, 20 ] )
 * @param lineStart String to print before each line
 * @param lineEnd String to print after each line
 * @param separator Separator to show between each column.
 */
export function table ( lines:string[][], firstLineAreLabels = false, minColumnWidths:number[] = [], lineStart = ' ', lineEnd = '', separator = chalk.grey(' │ ') )
{
	// Init column widths and total number of columns from arguments
	let columnWidths = minColumnWidths;
	let totalColumns = minColumnWidths.length;

	let prevColumnPosition = stripAnsi( lineStart ).length;
	const columnPositions = [ prevColumnPosition ];

	// Measure columns widths
	lines.map(
		line => line.map( (column, columnIndex) => {
			// Count total columns for every lines
			totalColumns = Math.max(totalColumns, columnIndex);

			// Convert column value to string to avoid length to fail
			// Strip ansi chars to count only visible chars
			const stringColumn = stripAnsi( column + '' );

			// Measure column width and keep the largest
			columnWidths[ columnIndex ] = (
				! (columnIndex in columnWidths)
				? stringColumn.length
				: Math.max( columnWidths[ columnIndex ], stringColumn.length )
			);
		})
	);

	// Here we browse to print
	lines.map( (line, lineIndex) =>
	{
		// Print line start if needed
		lineStart && process.stdout.write( lineStart );

		// Browse line's columns
		line.map( (column, columnIndex) => {
			const stringColumn = column + '';

			// Get column width and if last column
			const isLastColumn = ( columnIndex === totalColumns );
			const columnWidth = columnWidths[ columnIndex ];

			let columnToPrint = (
				( lineIndex === 0 && firstLineAreLabels )
					? chalk.bold( stringColumn )
					: stringColumn
			);

			// Print column + spaces + separator
			const content = [
				columnToPrint,
				repeat( columnWidth - stripAnsi(stringColumn).length ),
				isLastColumn ? lineEnd : separator
			].join('');

			process.stdout.write( content );

			if ( lineIndex === lines.length - 1)
			{
				prevColumnPosition += stripAnsi( content ).length;
				columnPositions[ columnIndex + 1 ] = prevColumnPosition;
			}
		});

		// Go to next line
		newLine();
	});

	return columnPositions;
}


export function clearScreen ( useProcess = true ) {
	useProcess ? execSync(`clear`) : console.clear()
}