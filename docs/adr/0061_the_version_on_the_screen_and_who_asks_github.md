# 0061. The version on the screen, and who asks GitHub

Date: 3 October 2026

## Status

Accepted. Part 2, section K of the request for 2.0.0. Builds on registries 0015 (meeting a
server), 0019 (the months ahead, and the one table with no space), 0020 (a build that serves
from anywhere), 0021 (housekeeping nobody is asked about), 0027 (a cost before a password, and
no service of anybody else at the door) and 0036 (a copy that keeps itself up to date).

## Context

Nothing in the application said which version it was. A person running a server could not tell
from the screen whether it was the release they meant to install, and nothing told them a newer
one existed, or how to move to it without losing what they have.

The cost of a page and a server of different versions is not hypothetical. Part 1, item G.1 of
2.0.0 found the page of one release sending a field the server of another dropped, so a payment
the month screen wrote lost the invoice it paid. And part 1, item H.2.1.4 found the notes of 1.1.0
failing to say that the server and the browser had to be updated together.

## Decision

**Where the version comes from.** One place, the `package.json` at the root. The build of the
interface reads it into a constant, `APP_VERSION`. The server reads it when it starts and says
it in the log and in `/api/setup`, which is public, because a page has to know which server it
is talking to before anybody signs in.

**What the screen shows.** Below the danger zone under Data, outside its red border, one line:
the name and the version. In browser mode, only that. On a server, also the version of the
server when it differs, and a secondary button, "Verificar atualização", for every person signed
in, whatever their role, because knowing a version is not a permission. Under the button, before
anybody presses it, the sentence that says what pressing it does: the server asks GitHub which
version was published last, only then, and GitHub sees the address of the server and nothing
else.

**A button and not a check of its own.** Rule 5: nothing leaves the owner's server without an
explicit action by somebody. A server that asked GitHub every day would tell GitHub every day
that it exists and where. The answer is kept an hour, a failure five minutes, and two presses at
once make one request.

**Who the server talks to.** The public API of GitHub, for the list of releases of this
repository, with no token, no cookie and no name of its own. Never the latest release as GitHub
names it, which is whatever was published last: a correction to the old line published after the
new one would be called the latest. The notes come back as text, cut at eight thousand
characters, and become elements, never markup; the link to the page of a version is built from
the version read, never from a link in the answer.

**How to update, for each way of installing.** The answer shows the commands for the way this
copy was installed, which the server works out from its environment: compose, `docker run`, an
image built at home, or no container. Every way starts with a copy of the server written
outside the clone. The copy the interface writes does not carry the accounts people sign in
with, which live only on the server, so it is not enough on its own. A server whose database is
not on a named volume, which it reads in `/proc/self/mountinfo`, gets no command at all, only the
warning: inside the container, or in the anonymous volume a `docker run` with no volume makes,
the data is lost the moment an update recreates the container.

**A tab open across an update.** The new worker throws away the cache of the old one as it takes
over, and a tab still running the old bundle asks for screens by names that are gone. When a
worker takes over a tab that already had one, the tab says so and offers to reload.

**No container updates itself.** A container that could pull its own image would need the
socket of Docker, which is root over the machine, inside the process that reads every file a
person uploads. Updating stays a command the owner runs.

**A page and a server of different major versions do not write to each other.** The page reads
the version of the server when it connects, and with another major version, or none, which is a
server of 1.x, it refuses every write before sending it and says why on every screen; reading
stays open. The exchange between devices refuses the same way. A server that finds a migration it
does not know in its database refuses to start, and says to run the version that migrated it or
to restore the copy.

**Going back** is restoring the copy of the first step and running the version before. Never an
older version over a database a newer one migrated, which is what the refusal above stops.

## Consequences

1. The compose file follows the published image on the line of version 2, so `docker compose
   pull` brings 2.x and never a version 3 nobody chose. Building from the source is a second
   file, `compose.build.yaml`.
2. The release puts `latest` only on the highest version tagged, so a correction to an old line
   never moves it back.
3. The interface and the server go up together, which the notes of every release say from now on.
