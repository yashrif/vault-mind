# Contributing to Copilot for Obsidian

First off, thank you for considering contributing to Copilot for Obsidian! It's people like you who make Copilot for Obsidian such a great tool!

## How Can I Contribute?

### Reporting Bugs or Suggesting Enhancements

Before submitting a bug report or suggestion, please check the [issues](https://github.com/logancyang/obsidian-copilot/issues) page for a list of currently known issues to ensure the bug has not already been reported. If it's a new bug or suggestion, create an issue and provide the following information:

- Use a clear and descriptive title.
- Describe the exact steps which reproduce the problem in as much detail as possible.
- Provide specific examples to demonstrate these steps.
- Describe the behavior you observed after following the steps, pointing out what exactly is the problem.
- Explain which behavior you expected to see instead and why.
- Include screenshots or animated GIFs showing you following the described steps and clearly demonstrating the problem.

### Your First Code Contribution

Unsure where to begin contributing to Copilot for Obsidian? You can start by looking through the `help-wanted` issues.

### Pull Requests

The process described here aims to:

- Maintain the quality of Copilot for Obsidian.
- Fix problems that are important to users.
- Engage the community in working towards the best possible Copilot for Obsidian.
- Enable a sustainable system for Copilot for Obsidian's maintainers to review contributions.

Please follow these steps to have your contribution considered by the maintainers:

1. Ensure the code adheres to a clean style consistent with the existing code.
2. Thoroughly test your changes before submitting.
3. Be descriptive in your pull request, linking to the issue it addresses, and showing screenshots demonstrating the change.
4. Once you receive feedback, update the code accordingly to address them before your pull request can be ultimately accepted.

### How to Set Up Dev Environment

Here is a great [writeup by Daniel Haven](https://medium.com/gitconnected/how-to-set-up-the-ideal-obsidian-plugin-development-workflow-b222fe72280f) on the best practices for setting up your dev environment for Obsidian plugins.

In the case of Copilot for Obsidian, you will need to:

1. Fork the repo.
2. Create a vault just for development.
3. Clone the forked repo into your vault's `plugins` folder.
4. Run `npm install` to install all dependencies.
5. Install the recommended VS Code extensions (Prettier and ESLint).
6. Ensure your editor respects the `.editorconfig` and Prettier settings.
7. Run `npm run dev` in your repo to see the effect of your changes.
8. Before committing, run `npm run format` to ensure all files are properly formatted.
9. When you are ready to make a pull request, ensure to make your changes in **a branch on your fork**, and then submit a pull request to the **main repo**.

Try to be descriptive in your branch names and pull requests. Happy coding!

## Prompt Testing

If you are making prompt changes, make sure to run the integration tests using the following steps:

First creating a `.env.test` file in the root directory with your Gemini API keys

```
GEMINI_API_KEY=your_api_key_here
```

Then run the integration tests:

```
npm run test:integration
```

## Manual Testing Checklist

This is a list of items to manually test after any non-trivial code change. Test the items relevant to your code change. If not sure, randomly choose items below.

First, **turn on debug mode in settings**, and open the dev console.

The most basic ones are model changes and mode changes.

### Test Fresh Install

- To ensure any **new users** can use the plugin on a **fresh install**, manually delete the `data.json` file in the plugin directory, disable the plugin in Obsidian, and re-enable it, enter the OpenAI API key and other API key(s) to see if **onboarding** is working.

### Chat / Tool mode

### Vault QA / Tool mode (with a small test vault)

- In Tool mode make sure you trigger this query with `@vault` or cmd/ctrl + shift + enter. And then check "Show Sources" button for the expected docs.

### Tool mode

- **Email**: logan@example.com

Thank you for contributing to Copilot for Obsidian!
