// js/command-palette.js

import { elements } from './dom.js';

class CommandPalette {
    constructor() {
        this._commands = [];
        this._filteredCommands = [];
        this._selectedIndex = 0;
        this.isVisible = false;
    }

    init() {
        elements.paletteInput.addEventListener('input', () => this._filterAndRender());
        elements.commandPalette.addEventListener('click', (e) => {
            if (e.target === elements.commandPalette) {
                this.hide();
            }
        });
        elements.paletteInput.addEventListener('keydown', (e) => this._handleKeyDown(e));
    }

    register(command) {
        this._commands.push(command);
    }

    toggle() {
        this.isVisible ? this.hide() : this.show();
    }

    show() {
        this.isVisible = true;
        elements.commandPalette.classList.remove('hidden');
        elements.paletteInput.value = '';
        elements.paletteInput.focus();
        this._filterAndRender();
    }

    hide() {
        this.isVisible = false;
        elements.commandPalette.classList.add('hidden');
    }

    _filterAndRender() {
        const query = elements.paletteInput.value.toLowerCase();
        
        this._filteredCommands = query
            ? this._commands.filter(cmd => cmd.name.toLowerCase().includes(query))
            : [...this._commands];

        elements.paletteResults.innerHTML = '';

        if (this._filteredCommands.length === 0) {
            elements.paletteResults.innerHTML = `<li class="no-results">无匹配结果</li>`;
            return;
        }

        this._selectedIndex = 0;

        const fragment = document.createDocumentFragment();
        this._filteredCommands.forEach((cmd, index) => {
            const li = document.createElement('li');
            li.dataset.commandId = cmd.id;
            li.textContent = cmd.name;
            if (index === this._selectedIndex) {
                li.classList.add('selected');
            }
            li.addEventListener('click', () => {
                this._execute(cmd.id);
            });
            fragment.appendChild(li);
        });
        elements.paletteResults.appendChild(fragment);
    }

    _handleKeyDown(event) {
        if (this._filteredCommands.length === 0) return;

        const items = Array.from(elements.paletteResults.children);

        switch (event.key) {
            case 'ArrowDown':
                event.preventDefault();
                items[this._selectedIndex]?.classList.remove('selected');
                this._selectedIndex = (this._selectedIndex + 1) % items.length;
                items[this._selectedIndex]?.classList.add('selected');
                items[this._selectedIndex]?.scrollIntoView({ block: 'nearest' });
                break;

            case 'ArrowUp':
                event.preventDefault();
                items[this._selectedIndex]?.classList.remove('selected');
                this._selectedIndex = (this._selectedIndex - 1 + items.length) % items.length;
                items[this._selectedIndex]?.classList.add('selected');
                items[this._selectedIndex]?.scrollIntoView({ block: 'nearest' });
                break;
            
            case 'Enter':
                event.preventDefault();
                const selectedCommandId = items[this._selectedIndex]?.dataset.commandId;
                if (selectedCommandId) {
                    this._execute(selectedCommandId);
                }
                break;

            case 'Escape':
                this.hide();
                break;
        }
    }

    _execute(commandId) {
        const command = this._commands.find(cmd => cmd.id === commandId);
        if (command && typeof command.action === 'function') {
            this.hide();
            command.action();
        }
    }
}

export const commandPalette = new CommandPalette();