/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

/* exported init */

const GETTEXT_DOMAIN = 'cryptokit';

const {Clutter, GObject, St} = imports.gi;

const ExtensionUtils = imports.misc.extensionUtils;
const Main = imports.ui.main;
const PanelMenu = imports.ui.panelMenu;
const PopupMenu = imports.ui.popupMenu;

const CryptoKit = ExtensionUtils.getCurrentExtension();
const {BinanceWS} = CryptoKit.imports.binance_ws;

const _ = ExtensionUtils.gettext;

const Indicator = GObject.registerClass(
    class Indicator extends PanelMenu.Button {
        _init() {
            super._init(0.0, _('Crypto Kit'));

            this.label = new St.Label({
                text: '...',
                y_align: Clutter.ActorAlign.CENTER,
            });
            this.add_child(this.label);

            let item = new PopupMenu.PopupMenuItem(_('Settings'));
            item.connect('activate', () => ExtensionUtils.openPrefs());
            this.menu.addMenuItem(item);
        }

        setValue(value) {
            this.value = value;
            this.updateLabel();
        }

        setPrecision(precision) {
            this.precision = precision;
            this.updateLabel();
        }

        updateLabel() {
            if (!this.value)
                return;

            const formatter = new Intl.NumberFormat(
                undefined, // TODO: Test locale switching
                {
                    minimumFractionDigits: this.precision,
                    maximumFractionDigits: this.precision,
                    style: 'currency',
                    currency: 'USD',
                }
            );

            this.label.text = formatter.format(this.value);
        }
    }
);

class Extension {
    constructor(uuid) {
        this.uuid = uuid;
        this.portfolio = [];
        ExtensionUtils.initTranslations(GETTEXT_DOMAIN);
    }

    enable() {
        this.indicator = new Indicator();
        Main.panel.addToStatusArea(this.uuid, this.indicator);

        this.settings = ExtensionUtils.getSettings('org.gnome.shell.extensions.cryptokit');
        this.settings.connect('changed::precision', this.refreshPrecision.bind(this));
        this.settings.connect('changed::refresh-interval', this.refreshRefreshInterval.bind(this));
        this.settings.connect('changed::portfolio', this.refreshPortfolio.bind(this));


        this.refreshPortfolio();
        this.refreshPrecision();
        this.b = new BinanceWS(
            this.portfolio.map(([pair]) => pair),
            this.settings.get_string('refresh-interval')
        );
        this.b.connect('update', (_self, ticks) => this.calculatePortfolioValue(ticks));
        this.b.startMonitoring();
    }

    disable() {
        this.indicator?.destroy();
        this.indicator = null;

        this.settings?.run_dispose();
        this.settings = null;

        this.binance?.destroy();
        this.binance = null;
    }

    refreshRefreshInterval() {
        this.b.configureRefreshInterval(this.settings.get_string('refresh-interval'));
    }

    refreshPrecision() {
        this.indicator.setPrecision(this.settings.get_int('precision'));
    }

    refreshPortfolio() {
        this.portfolio = this.settings.get_value('portfolio').deep_unpack();
    }

    // TODO: Handle cases where the symbol value isn't available.
    //       We don't want to report an incorrect portfolio value
    //       Lest we give someone a heart attack.
    calculatePortfolioValue(ticks) {
        const value = this.portfolio.reduce(
            (acc, [symbol, qty]) => acc + (ticks[`${symbol.toUpperCase()}USDT`]?.close * qty),
            0.0
        );
        this.indicator?.setValue(value);
    }
}

/**
 * @param {Object} meta Metadata
 */
function init(meta) {
    return new Extension(meta.uuid);
}