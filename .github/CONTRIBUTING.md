# Contributing to Customermates

Thanks for considering contributing to Customermates!

Please make sure to go through the [documentation](https://customermates.com/docs) before.

## How to Contribute

1. **Fork the Repository:** Click on the 'Fork' button in the upper right corner of the repository's GitHub page. This will create a copy of the repository in your GitHub account.

2. **Clone the Repository:** Clone your forked repository to your local machine using `git clone`.

   ```shell
   git clone https://github.com/yourusername/customermates.git
   cd customermates
   ```

3. **Create a New Branch:** Create a new branch for your changes from `develop` instead of working directly on `main` or `develop`.

   ```shell
   git checkout -b your-branch-name
   ```

4. **Make Changes:** Make your desired changes and ensure that your code adheres to Customermates' coding standards.

5. **Test Locally:** Test your changes locally to ensure they work as expected.

6. **Commit Changes:** Commit your changes with a clear and concise commit message.

   ```shell
   git commit -m "Add your detailed description here"
   ```

7. **Push Changes:** Push your changes to your forked repository.

   ```shell
   git push origin your-branch-name
   ```

8. **Create a Pull Request:** Go to the original Customermates repository and create a pull request. Please provide a detailed description of your changes and target the correct base branch according to the branch policy below. Submitting a PR means you agree to the [CLA](./CLA.md).

9. **Code Review:** Your pull request will undergo a code review.

10. **Merge:** Once approved, maintainers will merge your pull request into the main repository.

## Commit Message Convention

This repository enforces Conventional Commits via commit linting.

Use commit messages in this format:

```text
type(scope): short summary
```

Examples:

- `feat(auth): add reset password token validation`
- `fix(api): handle missing webhook signature`
- `docs: update self-hosting setup instructions`

If you add a commit body or footer, separate it from the subject with a blank line.

## Branch Stability Policy

Customermates uses a two-branch stability model:

- `main` is the **stable release branch** and always reflects the latest stable version.
- `develop` is the **integration branch** and contains the latest non-stable changes.

Unless maintainers specify otherwise, open pull requests against `develop`.

## Reporting Issues

If you face any issues or have suggestions, please feel free to [create an issue on Customermates' GitHub repository](https://github.com/customermates/customermates/issues/new). Please provide as much detail as possible.
