# Documentation

The same documents exist in [Portuguese](../pt-BR/README.md). The file names are the
same in both folders, so swapping `en` for `pt-BR` in any address lands on the same
page in the other language. English is written first and is what the other is made
from.

| document | what it answers |
| --- | --- |
| [Architecture](architecture.md) | how this is put together, and the one idea the rest follows from |
| [Data model](dataModel.md) | what is stored, in which table, and the rules that hold across all of them |
| [Flows](flows.md) | what happens, step by step, in the paths that matter |
| [API](api.md) | every endpoint the server answers, and what it expects |
| [Authentication](authentication.md) | who somebody is, how they prove it, and what guards the door |
| [Configuration](configuration.md) | every setting, what it does, and what goes wrong without it |
| [Deploy](deploy.md) | publishing each of the three modes |
| [Troubleshooting](troubleshooting.md) | the failures that actually happen, and what each one means |
| [Contributing](contributing.md) | how to work on this without fighting the tooling |

The decisions behind all of it are in [docs/adr](../adr), one record per decision that
is expensive to reverse, each with the options that were rejected and why. The
documents here say how it works. Those say why it is that way.
