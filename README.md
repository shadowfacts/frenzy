# Frenzy
Frenzy is a minimal, self-hosted RSS aggregator that implements the [Fever API](https://feedafever.com/api) for use with [client apps](#apps).

Fever API support in Frenzy is incomplete, and not all features are implemented. Currently unsupported features are: groups, hot links, and saved items.

## Usage
### Dependencies

Frenzy has **no external dependencies**, all that is required is Node.js and NPM.

### Installation

Clone this repository onto your server:

```bash
git clone https://github.com/shadowfacts/frenzy.git && cd frenzy
```

Install the dependencies:

```bash
npm install
```

Create your configuration:

```bash
cp config.js.example config.js
```

And edit `config.js` with your desired settings (see [Configuration](#configuration)).

Start the Frenzy server:

```bash
npm start
```

### Configuration

Configuration properties are specified in the `config.js` file. An example configuration is provided in [`config.js.example`](https://github.com/shadowfacts/frenzy/blob/master/config.js.example).

#### Properties

- **email** and **password**: the email and password you will use to sign in to Frenzy from [apps](#apps).
  - Note: the email does not have to be your real email, Frenzy does not send any emails.
- **feeds**: the URLs of RSS feeds you want Frenzy to track.
- **port**: the port on your server that Frenzy will bind to. This can be any port that is not already in use, and Frenzy can be placed behind a reverse proxy such as Nginx.
- **prettyPrint**: whether to save data (stored in the `data/` directory) as pretty-printed or minified JSON. In production, this should always be false, it is only provided to assist in debugging in development environments.

### Apps

The following apps have been tested and work with Frenzy:

- Reeder ([iOS](https://itunes.apple.com/us/app/reeder-3/id697846300?ls=1&mt=8) and [macOS](https://itunes.apple.com/us/app/reeder-3/id880001334?ls=1&mt=12))
- Unread ([iOS](https://itunes.apple.com/us/app/unread-rss-reader/id1252376153?mt=8))