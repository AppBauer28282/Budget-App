#!/usr/bin/env python3
"""Erzeugt assets/monatsbudget-vorlage.xlsx (Vorlage für "Aus Excel einlesen").

Ohne Zusatzpakete: eine .xlsx ist ein ZIP-Archiv mit XML-Dateien.
Alle Zahlen sind erfundene Beispiele.
Aufruf:  python3 tools/generate_vorlage.py
"""
import os
import zipfile
from xml.sax.saxutils import escape

ZIEL = os.path.join(os.path.dirname(__file__), '..', 'assets', 'monatsbudget-vorlage.xlsx')

KOPF = ['Jahr', 'Monat', 'Bereich', 'Kategorie', 'Bezeichnung', 'Betrag', 'Gegen', 'Karte']
BEREICHE = ['Gehalt', 'Fixkosten', 'Ausgabe', 'Sparen']
KATEGORIEN = ['Einkauf', 'Benzin', 'Gesundheit', 'Eltern', 'Konsum', 'Freizeit', 'Urlaub',
              'Jahresfix', 'sonstige KFZ-Ausgaben', 'Rücklagen', 'Auflösung Rücklagen', 'Rückzahlung']

# Erfundene Beispielzeilen.
ZEILEN = [
    (2026, 1, 'Gehalt', '', '', 3000),
    (2026, 1, 'Fixkosten', '', 'Miete', 800),
    (2026, 1, 'Fixkosten', '', 'Strom', 60),
    (2026, 1, 'Fixkosten', '', 'Internet', 35),
    (2026, 1, 'Ausgabe', 'Einkauf', 'Wocheneinkauf', 82.4),
    (2026, 1, 'Ausgabe', 'Einkauf', 'Bäcker', 6.9),
    (2026, 1, 'Ausgabe', 'Benzin', 'Tanken', 58),
    (2026, 1, 'Ausgabe', 'Freizeit', 'Kino', 24),
    (2026, 1, 'Ausgabe', 'Rücklagen', 'Rücklage Urlaub', 150),
    (2026, 1, 'Sparen', '', '', 250),
    (2026, 2, 'Gehalt', '', '', 3000),
    (2026, 2, 'Fixkosten', '', 'Miete', 800),
    (2026, 2, 'Fixkosten', '', 'Strom', 60),
    (2026, 2, 'Fixkosten', '', 'Internet', 35),
    (2026, 2, 'Ausgabe', 'Einkauf', 'Wocheneinkauf', 91.15),
    (2026, 2, 'Ausgabe', 'Konsum', 'Schuhe', 79.99),
    (2026, 2, 'Ausgabe', 'Gesundheit', 'Apotheke', 12.5),
    (2026, 2, 'Ausgabe', 'Auflösung Rücklagen', 'Urlaub gebucht', 100),
    (2026, 2, 'Ausgabe', 'Rückzahlung', 'Schuhe zurück', 79.99, 'Konsum', 'ja'),
    (2026, 2, 'Sparen', '', '', 250),
]

HINWEISE = [
    'So füllst du die Vorlage aus',
    '',
    'Blatt „Monatsbudget“: eine Zeile je Posten. Die Beispielzeilen kannst du überschreiben oder löschen.',
    'Die Überschriften in Zeile 1 bitte nicht ändern.',
    '',
    'Jahr: vierstellig, z. B. 2026.',
    'Monat: Zahl 1 bis 12 oder der Name, z. B. März.',
    'Bereich: Gehalt, Fixkosten, Ausgabe oder Sparen.',
    'Kategorie: nur bei „Ausgabe“ nötig. Erlaubt sind:',
    '   ' + ', '.join(KATEGORIEN),
    'Bezeichnung: frei wählbar, höchstens 80 Zeichen. Bei Gehalt und Sparen nicht nötig.',
    'Betrag: in Euro, immer größer als 0. Auch bei „Auflösung Rücklagen“ und „Rückzahlung“ ohne Minuszeichen.',
    'Gegen: nur bei Kategorie „Rückzahlung“ – die Kategorie, die gemindert wird, z. B. Konsum.',
    'Karte: nur bei „Rückzahlung“ – ja, wenn sie im Kreditkarten-Abgleich zählen soll, sonst nein. Leer = ja.',
    '',
    'Mehrere Gehalts-Zeilen im selben Monat werden zusammengezählt.',
    'Monate ohne Fixkosten-Zeilen bekommen die Fixkosten-Vorlage aus der App.',
    'Neue Monate werden in der App als abgeschlossen angelegt, die Fixkosten gelten als bezahlt.',
    'Vor dem Übernehmen zeigt die App eine Vorschau. Fehlerhafte Zeilen werden dort mit Zeilennummer genannt.',
    '',
    'Speichern als .xlsx oder als „CSV UTF-8“. Dann in der App: Monatsbudget → Sichern & Wiederherstellen → Aus Excel einlesen.',
]


def spalte(i):
    return 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[i]


def zelle(ref, wert, stil=0):
    s = f' s="{stil}"' if stil else ''
    if wert == '' or wert is None:
        return ''
    if isinstance(wert, (int, float)):
        return f'<c r="{ref}"{s}><v>{wert}</v></c>'
    return f'<c r="{ref}"{s} t="inlineStr"><is><t xml:space="preserve">{escape(wert)}</t></is></c>'


def blatt_daten():
    rows = ['<row r="1">' + ''.join(zelle(f'{spalte(i)}1', k, 1) for i, k in enumerate(KOPF)) + '</row>']
    for n, z in enumerate(ZEILEN, start=2):
        zellen = ''.join(zelle(f'{spalte(i)}{n}', w, 2 if i == 5 else 0) for i, w in enumerate(z))
        rows.append(f'<row r="{n}">{zellen}</row>')
    liste = lambda werte: '"' + ','.join(werte) + '"'
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<sheetViews><sheetView workbookViewId="0" tabSelected="1">'
        '<pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/>'
        '</sheetView></sheetViews>'
        '<cols><col min="1" max="2" width="9" customWidth="1"/><col min="3" max="3" width="14" customWidth="1"/>'
        '<col min="4" max="4" width="26" customWidth="1"/><col min="5" max="5" width="30" customWidth="1"/>'
        '<col min="6" max="6" width="14" customWidth="1"/><col min="7" max="7" width="22" customWidth="1"/>'
        '<col min="8" max="8" width="8" customWidth="1"/></cols>'
        '<sheetData>' + ''.join(rows) + '</sheetData>'
        '<dataValidations count="3">'
        '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Bereich" '
        'error="Bitte Gehalt, Fixkosten, Ausgabe oder Sparen wählen." sqref="C2:C5000">'
        f'<formula1>{escape(liste(BEREICHE))}</formula1></dataValidation>'
        '<dataValidation type="list" allowBlank="1" showErrorMessage="1" errorTitle="Kategorie" '
        'error="Bitte eine Kategorie aus der Liste wählen." sqref="D2:D5000">'
        f'<formula1>{escape(liste(KATEGORIEN))}</formula1></dataValidation>'
        '<dataValidation type="whole" allowBlank="1" showErrorMessage="1" errorTitle="Monat" '
        'error="Bitte eine Zahl von 1 bis 12 eintragen." sqref="B2:B5000">'
        '<formula1>1</formula1><formula2>12</formula2></dataValidation>'
        '</dataValidations>'
        '</worksheet>'
    )


def blatt_hinweise():
    rows = []
    for n, text in enumerate(HINWEISE, start=1):
        if text:
            rows.append(f'<row r="{n}">{zelle(f"A{n}", text, 1 if n == 1 else 0)}</row>')
    return (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<cols><col min="1" max="1" width="120" customWidth="1"/></cols>'
        '<sheetData>' + ''.join(rows) + '</sheetData></worksheet>'
    )


DATEIEN = {
    '[Content_Types].xml': (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>'
        '<Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>'
        '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>'
        '</Types>'
    ),
    '_rels/.rels': (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>'
        '</Relationships>'
    ),
    'xl/workbook.xml': (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" '
        'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">'
        '<sheets><sheet name="Monatsbudget" sheetId="1" r:id="rId1"/>'
        '<sheet name="Hinweise" sheetId="2" r:id="rId2"/></sheets></workbook>'
    ),
    'xl/_rels/workbook.xml.rels': (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">'
        '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>'
        '<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>'
        '<Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>'
        '</Relationships>'
    ),
    # Stil 0 = normal, 1 = fett (Überschrift), 2 = Betrag mit zwei Nachkommastellen.
    'xl/styles.xml': (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">'
        '<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font>'
        '<font><b/><sz val="11"/><name val="Calibri"/></font></fonts>'
        '<fills count="2"><fill><patternFill patternType="none"/></fill>'
        '<fill><patternFill patternType="gray125"/></fill></fills>'
        '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>'
        '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>'
        '<cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>'
        '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>'
        '<xf numFmtId="4" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/></cellXfs>'
        '<cellStyles count="1"><cellStyle name="Standard" xfId="0" builtinId="0"/></cellStyles>'
        '</styleSheet>'
    ),
    'xl/worksheets/sheet1.xml': blatt_daten(),
    'xl/worksheets/sheet2.xml': blatt_hinweise(),
}

if __name__ == '__main__':
    with zipfile.ZipFile(ZIEL, 'w', zipfile.ZIP_DEFLATED) as z:
        for name, inhalt in DATEIEN.items():
            # Festes Datum: gleiche Eingabe ergibt dieselbe Datei.
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            z.writestr(info, inhalt.encode('utf-8'))
    print('geschrieben:', os.path.normpath(ZIEL))
