## Solo command line user manual

Solo has a series of commands to use, and some commands have subcommands.
User can get help information by running with the following methods:

`solo --help` will return the help information for the `solo` command to show which commands
are available.

`solo command --help` will return the help information for the specific command to show which options

```text
solo account --help

Manage Hedera accounts in solo network

Commands:
  account init     Initialize system accounts with new keys
  account create   Creates a new account with a new key and stores the key in the Kubernetes secrets, if you supply no k
                   ey one will be generated for you, otherwise you may supply either a ECDSA or ED25519 private key
  account update   Updates an existing account with the provided info, if you want to update the private key, you can su
                   pply either ECDSA or ED25519 but not both

  account get      Gets the account info including the current amount of HBAR

Options:
      --dev      Enable developer mode                                                                         [boolean]
  -h, --help     Show help                                                                                     [boolean]
  -v, --version  Show version number                                                                           [boolean]
```

`solo command subcommand --help` will return the help information for the specific subcommand to show which options

```text
solo account create --help
Creates a new account with a new key and stores the key in the Kubernetes secrets, if you supply no key one will be gene
rated for you, otherwise you may supply either a ECDSA or ED25519 private key

Options:
      --dev                  Enable developer mode                                                             [boolean]
      --hbar-amount          Amount of HBAR to add                                                              [number]
      --create-amount        Amount of new account to create                                                    [number]
      --ecdsa-private-key    ECDSA private key for the Hedera account                                           [string]
  -n, --namespace            Namespace                                                                          [string]
      --ed25519-private-key  ED25519 private key for the Hedera account                                         [string]
      --generate-ecdsa-key   Generate ECDSA private key for the Hedera account                                 [boolean]
      --set-alias            Sets the alias for the Hedera account when it is created, requires --ecdsa-private-key
                                                                                                               [boolean]
  -h, --help                 Show help                                                                         [boolean]
  -v, --version              Show version number                                                               [boolean]
```

## For more information see: [SoloCommands.md](SoloCommands.md)

```
```
