import readline from 'node:readline';

function ask(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout
    });

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      rl.close();
      resolve(value.trim());
    };

    rl.question(question, finish);

    // If stdin closes (EOF / piped input exhausted), resolve empty rather than
    // hang. Guarded so a normal answer is never overwritten by the close event.
    rl.on('close', () => finish(''));
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
