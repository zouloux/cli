
// ----------------------------------------------------------------------------- STRUCT

interface ISSHOptions
{
	host		?:string
	user		?:string
	port		?:string
	password	?:string
	debug		?:boolean
}

// ----------------------------------------------------------------------------- SSH UTILITIES

/**
 * Prepare SSH Options.
 * Will extract 'user' from 'host'
 * Will extract 'port' from 'host'
 * Ex : if options.host = 'username@hostname:22', options will become :
 * 	- host = 'hostname'
 * 	- port = '22' ( as string )
 * 	- user = 'username'
 * @param options SSH Options for remote.
 */
export function prepareSSHOptions <O extends ISSHOptions = ISSHOptions> ( options:O )
{
	// Split user from host
	if ( options.host.indexOf('@') !== -1 ) {
		if ( options.user )
			throw new Error(`User already specified in options.host`);
		const split = options.host.split('@')
		options.user = split[0]
		options.host = split[1]
	}

	// Split port from home
	if ( options.host.indexOf(':') !== -1 ) {
		if ( options.port )
			throw new Error(`Port already specified in options.host`);
		const split = options.host.split(':')
		options.host = split[0]
		options.port = split[1]
	}

	return options;
}

/**
 * Prepend an SSH command ( already build with buildSSHCommand ) with an
 * sshpass command. SSH should be installed on client to be working.
 * It can be handy if remote does not manage RSA keys for login.
 * Install sshpass :
 * - Linux : sudo apt-get update -qq && sudo apt-get install -y -qq sshpass
 * - MacOS : brew install esolitos/ipa/sshpass
 * @param sshCommand SSH or Rsync command
 * @param options SSH Options for remote.
 */
export function prependSSHPass <O extends ISSHOptions = ISSHOptions> ( sshCommand:string, options:O ) {
	return (
		options.password
		? `sshpass -p '${options.password}' ${sshCommand}`
		: sshCommand
	);
}

/**
 * Build an SSH command to execute remote code.
 * @param remoteCommand Command to execute on remote part.
 * @param options SSH Options for remote.
 */
export function buildSSHCommand <O extends ISSHOptions = ISSHOptions> ( remoteCommand:string, options:O ) {
	// Replace double quotes for remote interpolation
	remoteCommand = remoteCommand.replace(/\"/g, '\\"')
	// Compute SSH command to host with port if needed
	const sshCommand = `ssh ${options.port ? `-p ${options.port}` : ''} -o StrictHostKeyChecking=no ${options.user ? options.user + '@' : ''}${options.host} "${remoteCommand}"`
	options.debug && console.log('> '+sshCommand)
	// Prepend SSH Pass after debug
	return prependSSHPass(sshCommand, options);
}

// ----------------------------------------------------------------------------- RSYNC UTILITIES
// TODO from chimera ? Maybe too specific ...
