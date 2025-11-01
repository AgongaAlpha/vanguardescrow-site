# Auth0 Verify

Verifies Auth0 tokens with promises.

## Installation

```bash
npm install --save auth0-verify
```

or install with Yarn:

```bash
yarn add auth0-verify
```

## Usage

```javascript
var verify = require('auth0-verify')

verify('some.access.token', 'auth0Username.auth0.com', 'auth0AppID')
	.then(function(res){
		console.log('Token is valid!')
		console.log('Token:', res)
	})
	.catch(function(err){
		console.log('Token is not valid!')
	})
```