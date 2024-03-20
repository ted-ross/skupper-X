# Skupper-X console

## Development

We use `yarn` as the package manager, if adding dependencies to `package.json`
make sure you install them with `yarn` and commit the `yarn.lock` file.

### Quick start

To get started quickly, follow the steps below:

1. Install the required dependencies by running `yarn install`.
2. Start the application by running `COLLECTOR_URL=<skupper-x network url>  yarn start`.
3. Open <http://localhost:3000> in your web browser.

or

1. Start the application by running `COLLECTOR_URL=<skupper-x network url>  yarn build`.
2. `serve build`
3. Open <http://localhost:3000> in your web browser (or the network link that you see in the terminal).
