exports.activate = api => {
  api.commands.registerCommand('hello.uppercase', context => ({
    text: context.text.toUpperCase(),
    message: `Uppercased ${context.path}`,
  }));
};
