# Neon Divide

A two-player browser shooter designed for two laptops placed side by side. Player 1 sees the left half of the shared arena; Player 2 sees the right half. The center seam lines up between the screens.

## Run it

Install Node.js 18 or newer, then from this folder run:

```sh
npm start
```

Open `http://localhost:8080` in a browser. For two computers on the same local network, open the host computer's local network address on both laptops.

## Play over the internet

Deploy this folder to a Node hosting service that supports persistent WebSocket connections (for example, a small Node web service on Render or Railway). The service uses the `PORT` environment variable and serves the game page and multiplayer connection from the same address. Use the public HTTPS URL on both laptops; the game automatically switches to secure WebSockets. One player shares their six-character room code with the other.

Controls: WASD or arrow keys to move; move the mouse to aim; hold click or Space to fire. Put Player 1 on the left and Player 2 on the right.
