# 0035. One backup, and one place on the screen for it

Date: 27 September 2026

## Status

Accepted. Amends registry 0026, which ordered the data screen, and registry 0015, which
decided what a backup is.

## Context

Somebody saved what they believed was their backup, wiped the device, picked the file
again and was refused. The file they had was the one written for syncing, which is a
change log rather than rows, and the screen had offered it a few lines under the one
that writes a backup, in words that sounded the same.

Reading that screen back, the reason was not one mistake. Three of its sections wrote a
file and two of them wrote JSON:

1. Every day, with Save a copy, which took the space that happened to be open.
2. Keep a copy somewhere else, which wrote the sync file of one space.
3. Take the data to another program, which hid Backup of every space, the only way to
   get a file with more than one space in it, under a line about spreadsheets.

So the button called a backup took the least, the file with everything was the hardest
to find, and the file that is not a backup was the easiest to reach by accident.

## Decision

### Everything about a copy is one section, and one button writes a backup

The section is called Backups and copies. It holds the backup, the door that brings one
back, and the places where a copy can live. Reading a statement in moved out into a
panel of its own: it reads a file from a bank and writes records, which is the opposite
direction and has nothing to do with keeping a copy.

There is one backup button. It writes one file whether it holds one space or nine,
named `cofre_backup_YYYYMMDD.json`, and `exportSpace` and `exportEverything` are now the
same method with a different list. The old names `cofre_espaco_*` and `cofre_completo_*`
are still read: a name is not a format, and nobody should have to know which of three
files on their disk this version will still open.

### The spaces are ticked, and all of them start ticked

A person who has a personal space and a shared one wants both, so both are ticked and
the file is whole by default. A space they may not copy, because they are neither Owner
nor Administrator of it, is shown unticked and says why: leaving it out silently would
be a file that is quietly smaller than it looks, and hiding the line would be a space
that vanished. With one space there is nothing to choose and the list is not drawn.

Which spaces those are is a permission, so it is answered by the repository layer and
not worked out by the screen from a role it would have to fetch and interpret. Asking
for a space that may not be copied is refused rather than dropped from the file.

### Bringing a file back lists what is inside it

A file of several spaces is a file somebody may want only part of. The confirmation
lists them, all ticked, and which ones to write is passed to the repository rather than
trimmed out of the file on the way in, so both modes cut it the same way and the file
itself is never rewritten.

### The last copy saved is the oldest of them

There is no single date any more. The panel shows the oldest among the spaces this
person may copy, and says never when any of them has never been saved, because the
question that line is really answering is whether the data is safe, and the answer to
that is the weakest space rather than the luckiest one.

### The file for syncing stays what it is, and says so

It cannot become the backup file. It carries one space, it is capped at twenty thousand
entries, and it carries no membership, so a space that arrives through it has nobody in
it until somebody adopts it. What changed is the words around it: that section keeps one
space up to date somewhere else, one at a time, and says out loud that the file you keep
is the backup.

The other direction did change, in registry 0015: the restore reads that file too, so
having only it is no longer a dead end.

## Consequences

A person who wants a copy of their money has one button, and it is on the section named
after what they came to do. A person who has ticked nothing is told so and the button is
off, which is better than a file with an empty list in it.

The screen lost a section and gained a fold, so it is one screen shorter to read. What
it gained in the other direction is a list that can grow: somebody with six spaces now
sees six lines where they used to see one button that quietly meant one space.

Two strings left the interface, Every day and Backup of every space, and the documents
that named them by hand were corrected in the same change.
