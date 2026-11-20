# Set up Pi re-signing

The Pi re-signs Momentum before the free 7-day profile expires. You plug the iPhone into the Mac once. You never plug it into the Pi.

## 1. Put the app on the phone

Skip this if Momentum is already on the phone and you have opened it.

1. In Xcode, add your Apple ID under **Xcode → Settings → Accounts**.
2. On the App target, turn on **Automatically manage signing**, choose your Personal Team, and keep the bundle id `com.momentum.workout`.
3. Unlock the iPhone, plug it into the Mac, and tap **Trust** if the phone asks.
4. On the iPhone, turn on **Settings → Privacy & Security → Developer Mode**. The phone restarts. Confirm it and enter your passcode.
5. In Xcode, select that iPhone (not a simulator) and press Run.
6. If the app will not open, go to **Settings → General → VPN & Device Management**, tap the certificate, and trust it.
7. In Finder, select the iPhone and turn on **Show this iPhone when on Wi-Fi**. Unplug the cable. The phone should still show up in Xcode while it is unlocked on the Mac's Wi-Fi.

Leave the Momentum icon on the home screen. Deleting it deletes the workouts.

## 2. Give the Pi the app

Unlock the iPhone on the same Wi-Fi as the Mac. From the Momentum repo on the Mac:

```bash
npm run ios:setup
```

The Mac reaches the Pi over SSH. Nothing plugs into the Pi.

Answer the dialogs:

1. The Pi sudo password, if one appears.
2. The Apple ID for the free developer team.
3. The Apple ID password. Use the account password, not an app-specific password.
4. The verification code, if Apple sends one.

## 3. Let the Pi install it

Unlock the iPhone on the Pi's home Wi-Fi and leave it unlocked. The Pi is on `192.168.7.x`. The phone has to be on that network. Tailscale does not count, and the Mac's Wi-Fi does not count when it is a different network.

The Pi checks every 30 minutes. It installs a new build, or a signature that is due, when it can see the phone. You can also tap **Update now** in the app. You do not run another command.

If iOS asks you to trust the developer again, use **Settings → General → VPN & Device Management**, then open Momentum.

## 4. After you change the app

On the Mac, with the phone unlocked on the Mac's Wi-Fi:

```bash
npm run ios:setup
```

Then leave the phone unlocked on the Pi's home Wi-Fi so the new build can install. Or open Momentum, go to Settings, and tap **Update now**. The phone asks the Pi to install immediately. Keep it unlocked. Momentum closes when the new version is ready. If iOS asks to find devices on the local network, allow it and tap the button again.

## See the last attempt

On the Pi:

```bash
journalctl -u momentum-resign -n 40 --no-pager
```

`installed` means it worked. `not visible` means the phone is not on the Pi's Wi-Fi, or it is asleep. `locked` means unlock it and wait for the next check.
