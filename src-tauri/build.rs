fn main() {
    println!("cargo:rerun-if-changed=src/injected_titlebar/bootstrap.js");
    println!("cargo:rerun-if-changed=src/injected_titlebar/titlebar.css");
    println!("cargo:rerun-if-changed=src/about_window_init.js");
    println!("cargo:rerun-if-changed=../src/about.html");
    println!("cargo:rerun-if-changed=../src/about.css");
    println!("cargo:rerun-if-changed=../src/about.js");
    println!("cargo:rerun-if-changed=icons/icon.png");
    tauri_build::build()
}
