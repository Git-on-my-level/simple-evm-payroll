import readline from 'node:readline';

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

    // If stdin closes (EOF / piped input exhausted), resolve empty rather than hang.
    rl.on('close', () => resolve(''));
  });
}

export async function askForConfirmation(question) {
  const answer = (await ask(question)).toLowerCase();
  return answer === 'y' || answer === 'yes';
}

export async function askForChoice(question, choices, maxAttempts = 5) {
  const validChoices = new Set(choices.map((choice) => choice.toLowerCase()));

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const answer = (await ask(question)).toLowerCase();
    if (validChoices.has(answer)) {
      return answer;
    }
    console.log(`Please enter one of: ${choices.join(', ')}`);
  }

  throw new Error(`No valid choice provided after ${maxAttempts} attempts.`);
}
