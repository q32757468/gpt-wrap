use base64::Engine;

const ABOUT_WINDOW_INIT: &str = include_str!("about_window_init.js");
const LOGO_PNG: &[u8] = include_bytes!("../icons/icon.png");
const LOGO_PLACEHOLDER: &str = "__GPTWRAP_ABOUT_LOGO__";
const VERSION_PLACEHOLDER: &str = "__GPTWRAP_ABOUT_VERSION__";
const GITHUB_URL_PLACEHOLDER: &str = "__GPTWRAP_ABOUT_GITHUB_URL__";
const GITHUB_URL: &str = "https://github.com/q32757468/gpt-wrap";

pub fn script() -> String {
    let logo = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(LOGO_PNG)
    );
    let logo = serde_json::to_string(&logo).expect("about window logo should serialize as JSON");
    let version = serde_json::to_string(env!("CARGO_PKG_VERSION"))
        .expect("application version should serialize as JSON");
    let github_url =
        serde_json::to_string(GITHUB_URL).expect("GitHub URL should serialize as JSON");

    ABOUT_WINDOW_INIT
        .replace(LOGO_PLACEHOLDER, &logo)
        .replace(VERSION_PLACEHOLDER, &version)
        .replace(GITHUB_URL_PLACEHOLDER, &github_url)
}

#[cfg(test)]
mod tests {
    use super::{script, GITHUB_URL_PLACEHOLDER, VERSION_PLACEHOLDER};

    #[test]
    fn script_contains_about_window_content() {
        let script = script();

        assert!(script.contains("data:image/png;base64,"));
        assert!(script.contains(&format!(
            "const APP_VERSION = {:?};",
            env!("CARGO_PKG_VERSION")
        )));
        assert!(script.contains("https://github.com/q32757468/gpt-wrap"));
        assert!(!script.contains("__GPTWRAP_ABOUT_LOGO__"));
        assert!(!script.contains(VERSION_PLACEHOLDER));
        assert!(!script.contains(GITHUB_URL_PLACEHOLDER));
    }
}
