import readline from 'readline';

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

export async function askForConfirmation(question) {
  const answer = await ask(question);
  return answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes';
}

export async function askForChoice(question, choices) {
  const validChoices = new Set(choices.map(choice => choice.toLowerCase()));

  while (true) {
    const answer = (await ask(question)).toLowerCase();
    if (validChoices.has(answer)) {
      return answer;
    }
    console.log(`Please enter one of: ${choices.join(', ')}`);
  }
}
