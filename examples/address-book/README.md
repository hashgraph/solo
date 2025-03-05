# Yahcli Address Book Example

This is an example of how to use Yahcli to pull the ledger and mirror node address book.  And to update the ledger address book.  It updates File 101 (the ledger address book file) and File 102 (the ledger node details file).

NOTE: Mirror Node refers to File 102 as its address book.

## Usage

To get the address book from the ledger, this requires a port forward to be setup on port 50211 to consensus node with node ID = 0.

> [!NOTE] 
> Due to file size, the Yahcli.jar file is stored with Git LFS (Large File Storage).  You will need to install Git LFS prior to cloning this repository to automatically download the Yahcli.jar file. For instructions on how to install see: https://docs.github.com/en/repositories/working-with-files/managing-large-files/installing-git-large-file-storage

```bash
# try and detect if the port forward is already setup
netstat -na | grep 50211
ps -ef | grep 50211 | grep -v grep

# setup a port forward if you need to
kubectl port-forward -n "${SOLO_NAMESPACE}" pod/network-node1-0 50211:50211
```

To get the address book from the ledger, run the following command:

```bash
cd <solo-root>/examples/address-book
task get:ledger:addressbook
```

It will output the address book in JSON format to:

* `examples/address-book/localhost/sysfiles/addressBook.json`
* `examples/address-book/localhost/sysfiles/nodeDetails.json`

You can update the address book files with your favorite text editor.

Once the files are ready, you can upload them to the ledger by running the following command:

```bash
cd <solo-root>/examples/address-book
task update:ledger:addressbook
```

To get the address book from the mirror node, run the following command:

```bash
cd <solo-root>/examples/address-book
task get:mirror:addressbook
```

NOTE: Mirror Node may not pick up the changes automatically, it might require running some transactions through, example:

```bash
cd <solo-root>
npm run solo -- account create
npm run solo -- account create
npm run solo -- account create
npm run solo -- account create
npm run solo -- account create
npm run solo -- account update -n solo-e2e --account-id 0.0.1004 --hbar-amount 78910 
```
