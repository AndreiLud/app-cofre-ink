// The shell, and nothing else.
//
// Cofre on a computer and Cofre on a telephone are the web build, unchanged, inside a
// window the operating system knows about. There is no second application and no
// second storage: the database is the same SQLite file the browser keeps, held this
// time in the folder that belongs to this application rather than in a browser profile.
//
// So there is nothing here. No command, no plugin, no bridge. Everything the product
// does, it does in the page, and the day something genuinely needs the machine, a file
// picker or a link opened in the real browser, it gets added here and nowhere else.

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .run(tauri::generate_context!())
        .expect("Cofre could not start its window");
}
