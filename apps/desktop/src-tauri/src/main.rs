// Windows opens a console behind a program unless it is told the program has a window.
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

fn main() {
    cofre_lib::run()
}
