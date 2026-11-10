import AuthenticationServices
import Capacitor
import Foundation

/// Opens tssamuel.com sign-in in a system sheet and returns the app-scheme callback URL.
/// The sheet shares Safari's cookies, so a login finished in Safari carries over on retry.
@objc(WebAuthPlugin)
public class WebAuthPlugin: CAPPlugin, CAPBridgedPlugin, ASWebAuthenticationPresentationContextProviding {
    public let identifier = "WebAuthPlugin"
    public let jsName = "WebAuth"
    public let pluginMethods: [CAPPluginMethod] = [
        CAPPluginMethod(name: "start", returnType: CAPPluginReturnPromise)
    ]

    private var session: ASWebAuthenticationSession?

    @objc func start(_ call: CAPPluginCall) {
        guard let urlString = call.getString("url"),
              let url = URL(string: urlString),
              let scheme = call.getString("callbackScheme"),
              !scheme.isEmpty else {
            call.reject("url and callbackScheme are required.", "INVALID")
            return
        }

        DispatchQueue.main.async {
            let session = ASWebAuthenticationSession(url: url, callbackURLScheme: scheme) { [weak self] callbackURL, error in
                self?.session = nil
                if let error = error as? ASWebAuthenticationSessionError, error.code == .canceledLogin {
                    call.reject("Sign-in was cancelled.", "CANCELLED")
                    return
                }
                if let error = error {
                    call.reject(error.localizedDescription, "FAILED", error)
                    return
                }
                guard let callbackURL = callbackURL else {
                    call.reject("Sign-in returned nothing.", "FAILED")
                    return
                }
                call.resolve(["url": callbackURL.absoluteString])
            }
            session.presentationContextProvider = self
            session.prefersEphemeralWebBrowserSession = false
            self.session = session
            if !session.start() {
                self.session = nil
                call.reject("Could not open sign-in.", "FAILED")
            }
        }
    }

    public func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        return bridge?.webView?.window ?? ASPresentationAnchor()
    }
}
