
const { CLICommands, oraTask } = require("../dist/index.es2017.cjs")
const { delay } = require("@zouloux/ecma-core");

const commands = new CLICommands({
	port: 3000,
}, {
	p: 'port'
});

commands.add('dev', async ( args, flags ) => {
	console.log( args, flags )
	await oraTask('Starting dev', async t => {
		await delay(Math.random() + 1)
		t.success()
	})
})

commands.add('server', async ( args, flags ) => {
	await oraTask(`Starting dev server on port ${flags.port}`, async t => {
		await delay(Math.random() + 1)
		t.success()
	})
})

commands.start( async ( command, error, args, flags, results ) => {
	// Default, execute all commands
	if (!command) {
		await commands.run('dev', [], flags)
		await commands.run('server', [], flags)
	}
});