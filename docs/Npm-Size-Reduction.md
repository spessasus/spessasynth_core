# NPM size reduction
The npm package works slightly differently than the standard installation.

> [!CAUTION]
> Do *not* use CDNs in your page linking directly to the package!
> It is not designed to be used this way, as a lot of redundant code will have to be fetched by the user.
> Downloading the package yourself and using bundlers with minified files instead will save a lot of bandwidth.


## The problem
The library contains a lot of other functionality than just the synthesizer,
which probably most people are going to use.
This is wasted bandwith.

This is a problem because it will be bundled by default when using bundlers such as webpack.

## The solution
The solution is to use "tree shaking."

For example, `webpack.config.js`;
```js
const path = require('path');

module.exports = {
    entry: './src/index.js',
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
    },

    module: {
        rules: [
            {
                // this enables tree shaking
                sideEffects: false
            }
        ]
    },

    mode: 'production',
};
```

This prevents unused modules from being included when not necessary.