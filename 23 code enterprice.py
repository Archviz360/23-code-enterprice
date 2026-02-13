import tkinter as tk
from tkinter import ttk, filedialog, messagebox, simpledialog
import os
import sys
from tkinter.scrolledtext import ScrolledText
from tkinter.font import Font

class AdvancedTextEditor:
    def __init__(self, root):
        self.root = root
        self.root.title("23 Code Enterprise")
        self.root.geometry("1200x800")

        self.current_file = None
        self.theme = "dark"
        self.color_scheme = "neon_blue"

        self.current_language = tk.StringVar()
        self.current_language.set("Normal Text")

        self.create_style()
        self.create_ui()
        self.create_bindings()

    def create_style(self):
        self.style = ttk.Style()
        self.style.theme_use('default')

        # Define colors
        bg_color = "#1e1e1e"
        fg_color = "#ffffff"
        neon_blue = "#00FFFF"

        # Configure styles
        self.style.configure("TFrame", background=bg_color)
        self.style.configure("TButton", background=bg_color, foreground=neon_blue, borderwidth=0)
        self.style.map("TButton", background=[('active', neon_blue)], foreground=[('active', bg_color)])
        self.style.configure("TLabel", background=bg_color, foreground=fg_color)
        self.style.configure("TMenubutton", background=bg_color, foreground=fg_color)
        self.style.configure("Vertical.TScrollbar", background=bg_color, troughcolor=bg_color, borderwidth=0)
        self.style.configure("Horizontal.TScrollbar", background=bg_color, troughcolor=bg_color, borderwidth=0)

        # Configure root window
        self.root.configure(bg=bg_color)

    def create_ui(self):
        self.create_menu()
        self.create_toolbars()
        self.create_text_area()
        self.create_status_bar()
        self.create_info_bar()

    def create_menu(self):
        menubar = tk.Menu(self.root)
        self.root.config(menu=menubar)

        file_menu = tk.Menu(menubar, tearoff=0)
        edit_menu = tk.Menu(menubar, tearoff=0)
        format_menu = tk.Menu(menubar, tearoff=0)
        view_menu = tk.Menu(menubar, tearoff=0)
        language_menu = tk.Menu(menubar, tearoff=0)
        help_menu = tk.Menu(menubar, tearoff=0)

        menubar.add_cascade(label="File", menu=file_menu)
        menubar.add_cascade(label="Edit", menu=edit_menu)
        menubar.add_cascade(label="Format", menu=format_menu)
        menubar.add_cascade(label="View", menu=view_menu)
        menubar.add_cascade(label="Language", menu=language_menu)
        menubar.add_cascade(label="Help", menu=help_menu)

        # File menu
        file_menu.add_command(label="New", command=self.new_file)
        file_menu.add_command(label="Open", command=self.open_file)
        file_menu.add_command(label="Save", command=self.save_file)
        file_menu.add_command(label="Save As", command=self.save_as)
        file_menu.add_separator()
        file_menu.add_command(label="Exit", command=self.root.quit)

        # Edit menu
        edit_menu.add_command(label="Undo", command=self.undo)
        edit_menu.add_command(label="Redo", command=self.redo)
        edit_menu.add_separator()
        edit_menu.add_command(label="Cut", command=self.cut)
        edit_menu.add_command(label="Copy", command=self.copy)
        edit_menu.add_command(label="Paste", command=self.paste)

        # Format menu
        format_menu.add_command(label="Word Wrap", command=self.toggle_word_wrap)
        format_menu.add_command(label="Font...", command=self.change_font)

        # View menu
        view_menu.add_command(label="Zoom In", command=self.zoom_in)
        view_menu.add_command(label="Zoom Out", command=self.zoom_out)
        view_menu.add_separator()
        view_menu.add_command(label="Toggle Full Screen", command=self.toggle_fullscreen)
        view_menu.add_separator()
        view_menu.add_command(label="Toggle Theme", command=self.toggle_theme)
        view_menu.add_command(label="Change Color Scheme", command=self.change_color_scheme)

        # Language menu
        modern_languages = tk.Menu(language_menu, tearoff=0)
        web_languages = tk.Menu(language_menu, tearoff=0)
        system_languages = tk.Menu(language_menu, tearoff=0)
        database_languages = tk.Menu(language_menu, tearoff=0)
        historical_languages = tk.Menu(language_menu, tearoff=0)
        esoteric_languages = tk.Menu(language_menu, tearoff=0)

        language_menu.add_cascade(label="Modern Languages", menu=modern_languages)
        language_menu.add_cascade(label="Web Technologies", menu=web_languages)
        language_menu.add_cascade(label="System Programming", menu=system_languages)
        language_menu.add_cascade(label="Database Languages", menu=database_languages)
        language_menu.add_cascade(label="Historical Languages", menu=historical_languages)
        language_menu.add_cascade(label="Esoteric Languages", menu=esoteric_languages)

        # Modern Languages
        modern_langs = ["Python", "Java", "C#", "JavaScript", "TypeScript", "Ruby", "Go", "Swift", "Kotlin", "Rust", "Dart", "Scala", "R", "Julia", "Lua", "Groovy", "Haskell", "Erlang", "Elixir", "F#", "Clojure", "OCaml"]
        
        # Web Technologies
        web_langs = ["HTML", "CSS", "PHP", "ASP.NET", "JSP", "Node.js", "React", "Angular", "Vue.js", "Django", "Ruby on Rails", "Flask", "Laravel", "Express.js"]
        
        # System Programming
        system_langs = ["C", "C++", "Assembly", "Fortran", "COBOL", "Ada", "D", "Objective-C", "Verilog", "VHDL"]
        
        # Database Languages
        db_langs = ["SQL", "PL/SQL", "T-SQL", "MongoDB Query Language", "Cassandra Query Language", "HiveQL", "Cypher (Neo4j)"]
        
        # Historical Languages
        historical_langs = ["ALGOL", "BASIC", "Pascal", "Lisp", "Smalltalk", "APL", "Forth", "Prolog", "ML", "Simula", "PL/I", "RPG", "SNOBOL", "MUMPS", "Logo"]
        
        # Esoteric Languages
        esoteric_langs = ["Brainfuck", "Whitespace", "Piet", "Shakespeare", "Befunge", "INTERCAL", "LOLCODE", "Rockstar", "ArnoldC", "Chicken"]

        self.add_language_menu_items(modern_languages, modern_langs)
        self.add_language_menu_items(web_languages, web_langs)
        self.add_language_menu_items(system_languages, system_langs)
        self.add_language_menu_items(database_languages, db_langs)
        self.add_language_menu_items(historical_languages, historical_langs)
        self.add_language_menu_items(esoteric_languages, esoteric_langs)

        # Add "Normal Text" option at the top of the main language menu
        language_menu.insert_radiobutton(0, label="Normal Text", variable=self.current_language, 
                                         command=self.change_language)
        language_menu.insert_separator(1)

        # Help menu
        help_menu.add_command(label="About", command=self.show_about)

    def add_language_menu_items(self, menu, languages):
        for lang in sorted(languages):
            menu.add_radiobutton(label=lang, variable=self.current_language, 
                                 command=self.change_language)

    def create_toolbars(self):
        # Left toolbar
        self.left_toolbar = ttk.Frame(self.root, relief=tk.RAISED, borderwidth=1)
        self.left_toolbar.pack(side=tk.LEFT, fill=tk.Y)

        tools = [
            ("Find", self.find),
            ("Replace", self.replace),
            ("Go to line", self.go_to_line),
            ("Tabs", self.manage_tabs),
            ("Word wrap", self.toggle_word_wrap),
            ("Line numbers", self.toggle_line_numbers),
            ("Full screen", self.toggle_fullscreen),
            ("Print", self.print_file)
        ]

        for text, command in tools:
            btn = ttk.Button(self.left_toolbar, text=text, command=command)
            btn.pack(side=tk.TOP, padx=2, pady=2)

        # Right toolbar (asset display)
        self.right_toolbar = ttk.Frame(self.root, relief=tk.RAISED, borderwidth=1)
        self.right_toolbar.pack(side=tk.RIGHT, fill=tk.Y)

        # Placeholder for asset display
        self.asset_listbox = tk.Listbox(self.right_toolbar)
        self.asset_listbox.pack(expand=True, fill=tk.BOTH)
        self.asset_listbox.bind('<Double-1>', self.open_asset)

        # Comment out the toggle buttons
        # self.toggle_frame = ttk.Frame(self.root)
        # self.toggle_frame.pack(side=tk.TOP, anchor=tk.NE)

        # ttk.Button(self.toggle_frame, text="Toggle Left Toolbar", command=self.toggle_left_toolbar).pack(side=tk.LEFT)
        # ttk.Button(self.toggle_frame, text="Toggle Right Toolbar", command=self.toggle_right_toolbar).pack(side=tk.LEFT)

    def create_text_area(self):
        self.text_frame = ttk.Frame(self.root)
        self.text_frame.pack(expand=True, fill=tk.BOTH)

        self.line_numbers = tk.Text(self.text_frame, width=4, padx=3, takefocus=0, border=0, background='#2e2e2e', foreground='#00FFFF', state='disabled')
        self.line_numbers.pack(side=tk.LEFT, fill=tk.Y)

        self.text_area = ScrolledText(self.text_frame, wrap=tk.WORD, undo=True, background="#1e1e1e", foreground="#ffffff", insertbackground="#00FFFF")
        self.text_area.pack(expand=True, fill=tk.BOTH)

        # Custom scrollbars
        self.text_area.config(yscrollcommand=self.set_scrollbar)
        self.scrollbar = ttk.Scrollbar(self.text_frame, orient="vertical", command=self.text_area.yview)
        self.scrollbar.pack(side=tk.RIGHT, fill=tk.Y)

    def create_status_bar(self):
        self.status_bar = ttk.Label(self.root, text="Ready", anchor=tk.W)
        self.status_bar.pack(side=tk.BOTTOM, fill=tk.X)

    def create_info_bar(self):
        self.info_bar = ttk.Label(self.root, text="", anchor=tk.W)
        self.info_bar.pack(side=tk.BOTTOM, fill=tk.X)
        self.update_info_bar()

    def create_bindings(self):
        self.text_area.bind('<Control-n>', lambda e: self.new_file())
        self.text_area.bind('<Control-o>', lambda e: self.open_file())
        self.text_area.bind('<Control-s>', lambda e: self.save_file())
        self.text_area.bind('<Control-S>', lambda e: self.save_as())
        self.text_area.bind('<Control-q>', lambda e: self.root.quit())
        self.text_area.bind('<Control-f>', lambda e: self.find())
        self.text_area.bind('<Control-h>', lambda e: self.replace())
        self.text_area.bind('<Control-g>', lambda e: self.go_to_line())
        self.text_area.bind('<Control-plus>', lambda e: self.zoom_in())
        self.text_area.bind('<Control-minus>', lambda e: self.zoom_out())

    def new_file(self):
        self.text_area.delete(1.0, tk.END)
        self.current_file = None
        self.root.title("Untitled - 23 Code Enterprise")

    def open_file(self):
        file_path = filedialog.askopenfilename(filetypes=[("All Files", "*.*")])
        if file_path:
            with open(file_path, "r") as file:
                content = file.read()
                self.text_area.delete(1.0, tk.END)
                self.text_area.insert(tk.END, content)
            self.current_file = file_path
            self.root.title(f"{os.path.basename(file_path)} - 23 Code Enterprise")

    def save_file(self):
        if self.current_file:
            content = self.text_area.get(1.0, tk.END)
            with open(self.current_file, "w") as file:
                file.write(content)
        else:
            self.save_as()

    def save_as(self):
        file_types = [
            ('Text file', '*.txt'),
            ('All Files', '*.*')
        ]

        # Modern Languages
        modern_types = [
            ('Python file', '*.py'), ('Java file', '*.java'), ('C# file', '*.cs'),
            ('JavaScript file', '*.js'), ('TypeScript file', '*.ts'), ('Ruby file', '*.rb'),
            ('Go file', '*.go'), ('Swift file', '*.swift'), ('Kotlin file', '*.kt'),
            ('Rust file', '*.rs'), ('Dart file', '*.dart'), ('Scala file', '*.scala'),
            ('R file', '*.r'), ('Julia file', '*.jl'), ('Lua file', '*.lua'),
            ('Groovy file', '*.groovy'), ('Haskell file', '*.hs'), ('Erlang file', '*.erl'),
            ('Elixir file', '*.ex'), ('F# file', '*.fs'), ('Clojure file', '*.clj'),
            ('OCaml file', '*.ml')
        ]

        # Web Technologies
        web_types = [
            ('HTML file', '*.html'), ('CSS file', '*.css'), ('PHP file', '*.php'),
            ('ASP.NET file', '*.aspx'), ('JSP file', '*.jsp'), ('Node.js file', '*.js'),
            ('React file', '*.jsx'), ('Angular file', '*.ts'), ('Vue.js file', '*.vue'),
            ('Django file', '*.py'), ('Ruby on Rails file', '*.rb'), ('Flask file', '*.py'),
            ('Laravel file', '*.php'), ('Express.js file', '*.js')
        ]

        # System Programming
        system_types = [
            ('C file', '*.c'), ('C++ file', '*.cpp'), ('Assembly file', '*.asm'),
            ('Fortran file', '*.f90'), ('COBOL file', '*.cob'), ('Ada file', '*.ada'),
            ('D file', '*.d'), ('Objective-C file', '*.m'), ('Verilog file', '*.v'),
            ('VHDL file', '*.vhd')
        ]

        # Database Languages
        db_types = [
            ('SQL file', '*.sql'), ('PL/SQL file', '*.pls'), ('T-SQL file', '*.sql'),
            ('MongoDB Query file', '*.js'), ('Cassandra Query file', '*.cql'),
            ('HiveQL file', '*.hql'), ('Cypher file', '*.cyp')
        ]

        # Historical Languages
        historical_types = [
            ('ALGOL file', '*.alg'), ('BASIC file', '*.bas'), ('Pascal file', '*.pas'),
            ('Lisp file', '*.lisp'), ('Smalltalk file', '*.st'), ('APL file', '*.apl'),
            ('Forth file', '*.fth'), ('Prolog file', '*.pl'), ('ML file', '*.ml'),
            ('Simula file', '*.sim'), ('PL/I file', '*.pli'), ('RPG file', '*.rpg'),
            ('SNOBOL file', '*.sno'), ('MUMPS file', '*.mps'), ('Logo file', '*.logo')
        ]

        # Esoteric Languages
        esoteric_types = [
            ('Brainfuck file', '*.bf'), ('Whitespace file', '*.ws'), ('Piet file', '*.piet'),
            ('Shakespeare file', '*.spl'), ('Befunge file', '*.bf'), ('INTERCAL file', '*.i'),
            ('LOLCODE file', '*.lol'), ('Rockstar file', '*.rock'), ('ArnoldC file', '*.arnoldc'),
            ('Chicken file', '*.chicken')
        ]

        all_types = (
            [('Text file', '*.txt')] +
            modern_types + web_types + system_types + db_types + historical_types + esoteric_types +
            [('All Files', '*.*')]
        )

        file_path = filedialog.asksaveasfilename(
            defaultextension=".txt",
            filetypes=all_types,
            title="Save As"
        )
        
        if file_path:
            content = self.text_area.get(1.0, tk.END)
            with open(file_path, "w") as file:
                file.write(content)
            self.current_file = file_path
            self.root.title(f"{os.path.basename(file_path)} - 23 Code Enterprise")
            
            # Update the status bar or info bar to show the saved file type
            file_extension = os.path.splitext(file_path)[1]
            self.update_status_bar(f"File saved as {file_extension} format")

    def update_status_bar(self, message):
        self.status_bar.config(text=message)

    def cut(self):
        self.text_area.event_generate("<<Cut>>")

    def copy(self):
        self.text_area.event_generate("<<Copy>>")

    def paste(self):
        self.text_area.event_generate("<<Paste>>")

    def undo(self):
        try:
            self.text_area.edit_undo()
        except tk.TclError:
            pass

    def redo(self):
        try:
            self.text_area.edit_redo()
        except tk.TclError:
            pass

    def find(self):
        query = simpledialog.askstring("Find", "Enter text:")
        if query:
            self.text_area.tag_remove('find_match', '1.0', tk.END)
            idx = '1.0'
            while True:
                idx = self.text_area.search(query, idx, nocase=1, stopindex=tk.END)
                if not idx:
                    break
                lastidx = f"{idx}+{len(query)}c"
                self.text_area.tag_add('find_match', idx, lastidx)
                idx = lastidx
            self.text_area.tag_config('find_match', background='yellow', foreground='black')

    def replace(self):
        find_text = simpledialog.askstring("Find", "Text to replace:")
        if find_text is None:
            return
        replace_text = simpledialog.askstring("Replace", "Replace with:")
        if replace_text is None:
            return
        content = self.text_area.get('1.0', tk.END)
        self.text_area.delete('1.0', tk.END)
        self.text_area.insert('1.0', content.replace(find_text, replace_text))

    def go_to_line(self):
        line = simpledialog.askinteger("Go To Line", "Line number:")
        if line:
            max_line = int(self.text_area.index(tk.END).split('.')[0])
            line = max(1, min(line, max_line))
            self.text_area.mark_set(tk.INSERT, f"{line}.0")
            self.text_area.see(f"{line}.0")

    def manage_tabs(self):
        # Implement tab management
        pass

    def toggle_word_wrap(self):
        current = self.text_area.cget('wrap')
        new_wrap = tk.NONE if current != tk.NONE else tk.WORD
        self.text_area.config(wrap=new_wrap)

    def toggle_line_numbers(self):
        if self.line_numbers.winfo_viewable():
            self.line_numbers.pack_forget()
        else:
            self.line_numbers.pack(side=tk.LEFT, fill=tk.Y)
            self.update_line_numbers()

    def toggle_fullscreen(self):
        self.root.attributes('-fullscreen', not self.root.attributes('-fullscreen'))

    def print_file(self):
        # Implement print functionality
        pass

    def zoom_in(self):
        font = Font(font=self.text_area['font'])
        font.configure(size=font.cget('size') + 1)
        self.text_area.configure(font=font)

    def zoom_out(self):
        font = Font(font=self.text_area['font'])
        font.configure(size=max(1, font.cget('size') - 1))
        self.text_area.configure(font=font)

    def toggle_theme(self):
        # This method is now redundant as we're using a fixed theme
        pass

    def change_color_scheme(self):
        # This method is now redundant as we're using a fixed color scheme
        pass

    def change_font(self):
        # Implement font change dialog
        pass

    def open_asset(self, event):
        # Implement asset opening in new tab
        pass

    def on_key_press(self, event):
        self.update_line_numbers()
        self.update_status_bar()

    def on_mousewheel(self, event):
        self.update_line_numbers()

    def update_line_numbers(self):
        lines = self.text_area.get('1.0', tk.END).split('\n')
        line_numbers_text = '\n'.join(str(i) for i in range(1, len(lines) + 1))
        self.line_numbers.config(state='normal')
        self.line_numbers.delete('1.0', tk.END)
        self.line_numbers.insert('1.0', line_numbers_text)
        self.line_numbers.config(state='disabled')

    def update_status_bar(self):
        cursor_position = self.text_area.index(tk.INSERT)
        line, column = cursor_position.split('.')
        status_text = f"Line: {line} | Column: {column}"
        if self.current_file:
            status_text += f" | File: {os.path.basename(self.current_file)}"
        self.status_bar.config(text=status_text)

    def update_info_bar(self):
        file_size = os.path.getsize(self.current_file) if self.current_file else 0
        file_type = os.path.splitext(self.current_file)[1] if self.current_file else "N/A"
        info_text = f"Size: {file_size} bytes | Type: {file_type} | Editor Version: 1.0 | Python Version: {sys.version.split()[0]}"
        self.info_bar.config(text=info_text)

    def show_about(self):
        about_text = (
            "23 Code Enterprise\n"
            "Version 1.0\n\n"
            "Created by D.S\n\n"
            "Redistribution, adding features, and publishing are allowed\n"
            "as long as credits to D.S are given."
        )
        messagebox.showinfo("About", about_text)

    def set_scrollbar(self, *args):
        self.scrollbar.set(*args)
        self.on_scrollbar_move()

    def on_scrollbar_move(self, *args):
        self.text_area.yview_moveto(self.scrollbar.get()[0])
        self.update_line_numbers()

    def change_language(self):
        selected_language = self.current_language.get()
        # Here you would implement language-specific features like syntax highlighting
        self.update_status_bar(f"Language changed to {selected_language}")
        # For now, we'll just update the status bar
        # In a full implementation, you'd apply syntax highlighting rules here

if __name__ == "__main__":
    root = tk.Tk()
    app = AdvancedTextEditor(root)
    root.mainloop()