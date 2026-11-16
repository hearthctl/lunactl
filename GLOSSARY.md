# lunactl

Ein kleines Bediengerät im Kinderzimmer, mit dem die Tochter über Home Assistant Licht, Klimaanlage und einen Ruf an Papa auslöst.

## Aktionen

**Aktion**:
Etwas, das die Tochter am Gerät auslöst und das Home Assistant ausführt. Das Gerät weiß nur, welche Aktion gemeint ist, nicht, was sie im Haus bewirkt.
_Avoid_: Befehl, Kommando

**Licht-Szene**:
Eine Aktion, die einen festen Lichtzustand im Zimmer herstellt. Es gibt genau vier: Hell, Lesen, Gemütlich, Schlafen gehen.
_Avoid_: Szene (allein), Preset, Modus

**Hell**:
Die Licht-Szene mit Decke und Bett voll hell in neutralem Licht.

**Lesen**:
Die Licht-Szene mit hellem Warmlicht nur am Bett.

**Gemütlich**:
Die Licht-Szene mit Warmlicht an Decke und Bett.

**Schlafen gehen**:
Die Licht-Szene zum Einschlafen: LEDs am Bett direkt auf schwaches Warmlicht, übriges Licht aus.
_Avoid_: Nachtmodus, Gute Nacht

**Klima-Lauf**:
Die Klimaanlage läuft für 30 Minuten und schaltet sich dann selbst ab. Erneutes Auslösen startet die 30 Minuten neu.
_Avoid_: Timer, Boost

**Kühlen** / **Heizen**:
Die beiden Aktionen, die einen Klima-Lauf im jeweiligen Modus starten.
_Avoid_: Klima, AC

**Klima aus**:
Eine Aktion, die die Klimaanlage sofort abschaltet, egal wer sie eingeschaltet hat.

**Papa rufen**:
Eine Aktion, die Papa eine normale Benachrichtigung aufs Handy schickt.
_Avoid_: Alarm, Notruf

**Papa kommt**:
Papas Antwort auf Papa rufen, die das Kind am Gerät angezeigt bekommt.
_Avoid_: Bestätigung, Ack

## Darstellung

**Manifest**:
Die gesamte Beschreibung, die das Gerät aus Home Assistant holt und darstellt: welche Seiten es gibt, was in jedem Slot steht und was die Tasten auslösen.
_Avoid_: Layout, Config, Belegung

**Page type**:
Eine fest in die Firmware eingebaute Anordnung einer Seite. Das Manifest wählt pro Seite einen Page type und befüllt dessen Slots.
_Avoid_: Template, Vorlage

**Pie**:
Der Page type mit vier Tortenvierteln. Ohne Item in der Mitte zeigt ein kleines Loch die Uhrzeit; mit Item in der Mitte wird das Loch groß, und die Viertel zeigen nur noch gebogenen Text und Farbe.
_Avoid_: Grid, Ring

**Single**:
Der Page type mit einem einzigen großen Slot.

**Slot**:
Eine Position in einem Page type, die das Manifest befüllt.
_Avoid_: Platz, Position, Cell

**Item**:
Der Inhalt eines Slots. Ein Item ist immer antippbar und löst dann eine Home-Assistant-Aktion aus. Es kann Text, Symbol, Farbe, einen Live-Wert und eine Restzeit mitbringen; der Page type zeigt davon, was in den Slot passt.
_Avoid_: Kachel, Tile, Widget, Entry, Control

## Tasten

**Taste A**:
Die gelbe Taste. Sie löst Gemütlich aus, oder Schlafen gehen, wenn die Decke schon an ist.
_Avoid_: KEYA, Licht-Taste

**Taste B**:
Die blaue Taste. Lang gedrückt löst sie Papa rufen aus.
_Avoid_: KEYB, Notfall-Taste
