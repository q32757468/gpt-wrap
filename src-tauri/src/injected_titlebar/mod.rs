use base64::Engine;

const BOOTSTRAP: &str = include_str!("bootstrap.js");
const TITLEBAR_CSS: &str = include_str!("titlebar.css");
const LOGO_PNG: &[u8] = include_bytes!("../../icons/icon.png");
const CSS_PLACEHOLDER: &str = "__GPTWRAP_TITLEBAR_CSS__";
const LOGO_PLACEHOLDER: &str = "__GPTWRAP_TITLEBAR_LOGO__";

/// Returns the self-contained initialization script for the main window titlebar.
///
/// The stylesheet is serialized as a JavaScript string at compile time so that
/// quotes, backslashes, and newlines in the CSS cannot change the bootstrap
/// script's syntax.
pub fn script() -> String {
    let css = serde_json::to_string(TITLEBAR_CSS)
        .expect("titlebar stylesheet should always serialize as JSON");
    let logo = format!(
        "data:image/png;base64,{}",
        base64::engine::general_purpose::STANDARD.encode(LOGO_PNG)
    );
    let logo = serde_json::to_string(&logo).expect("titlebar logo should always serialize as JSON");

    BOOTSTRAP
        .replace(CSS_PLACEHOLDER, &css)
        .replace(LOGO_PLACEHOLDER, &logo)
}

#[cfg(test)]
mod tests {
    use super::script;

    #[test]
    fn script_contains_serialized_stylesheet_and_no_placeholder() {
        let script = script();

        assert!(script.contains("GPTWrap window controls"));
        assert!(!script.contains("__GPTWRAP_TITLEBAR_CSS__"));
        assert!(!script.contains("__GPTWRAP_TITLEBAR_LOGO__"));
        assert!(script.contains("data:image/png;base64,"));
        assert!(script.contains("padding-top"));
        assert!(script.contains("applyPageSafeArea"));
        assert!(script.contains("data-action=\"about\""));
        assert!(script.contains("data-action=\"check-update\""));
        assert!(script.contains("open_about_window"));
        assert!(script.contains("autoCheck: false"));
        assert!(script.contains("autoCheck: true"));
        assert!(script.contains("autoCheck"));
        assert!(!script.contains("--gptwrap-titlebar-content-height"));
        assert!(!script.contains("body main > :first-child"));
        assert!(!script.contains("scrollbar-width: none"));
    }
}
