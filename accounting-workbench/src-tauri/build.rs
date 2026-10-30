fn main() {
    // 换图标后必须重跑构建脚本，否则 exe 里的 icon 资源还是旧的（cargo 默认不跟踪 icons/*）。
    println!("cargo:rerun-if-changed=icons/icon.ico");
    println!("cargo:rerun-if-changed=icons/icon.png");
    tauri_build::build()
}
