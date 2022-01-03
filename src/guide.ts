import path from 'path'
import { WgConfig, getConfigObjectFromFile, createPeerPairs, checkWgIsInstalled } from 'wireguard-tools'

const filePath = path.join(__dirname, '/configs', '/guardline-server.conf')

const test = async () => {
  const version = await checkWgIsInstalled()
  console.log(version)

  try {
    // make a new config
    const config1 = new WgConfig({
      wgInterface: {
        address: ['10.10.1.1']
      },
      filePath
    })

    // give the config a name
    config1.wgInterface.name = 'Server'

    // update some other properties
    config1.wgInterface.postUp = ['iptables -A FORWARD -i wg0 -j ACCEPT; iptables -t nat -A POSTROUTING -o eth0 -j MASQUERADE']
    config1.wgInterface.postDown = ['iptables -D FORWARD -i wg0 -j ACCEPT; iptables -t nat -D POSTROUTING -o eth0 -j MASQUERADE']
    config1.wgInterface.listenPort = 51820

    // make a keypair for the config and a pre-shared key
    const keypair = await config1.generateKeys({ preSharedKey: true })

    // these keys will be saved to the config object
    console.log(keypair.publicKey === config1.publicKey) // true
    console.log(keypair.preSharedKey === config1.preSharedKey) // true
    console.log(keypair.privateKey === config1.wgInterface.privateKey) // true

    // write the config to disk
    await config1.writeToFile()

    // read that file into another config object
    const thatConfigFromFile = await getConfigObjectFromFile({ filePath })
    const config2FilePath = path.join(__dirname, '/configs', '/guardline-server-2.conf')
    const config2 = new WgConfig({
      ...thatConfigFromFile,
      filePath: config2FilePath
    })

    // both configs private key will be the same because config2 has been parsed
    // from the file written by config
    console.log(config1.wgInterface.privateKey === config2.wgInterface.privateKey)

    // however, config2 doesn't have a public key becuase WireGuard doesn't save the
    // the public key in the config file.
    // To get the public key, you'll need to run generateKeys on config2
    // it'll keep it's private key and derive a public key from it
    await config2.generateKeys()

    // so now the two public keys will be the same
    console.log(config1.publicKey === config2.publicKey) // true

    // you can generate a new keypair by passing an arg:
    config2.generateKeys({ overwrite: true })

    // so now their public/private keys are different
    console.log(config1.publicKey === config2.publicKey) // false

    // you can create a peer object from a WgConfig like this
    const config2AsPeer = config2.createPeer({
      allowedIps: ['10.10.1.1/32']
    })

    // you can add a peer to a config like this:
    config1.addPeer(config2AsPeer)

    // and remove a peer like this
    config2.publicKey && config1.removePeer(config2.publicKey)

    // or you make two WgConfigs peers of each other like this:
    createPeerPairs([
      {
        config: config1,
        // The peer settings to apply when adding this config as a peer
        peerSettings: {
          allowedIps: ['10.10.1.1'],
          preSharedKey: config1.preSharedKey
        }
      },
      {
        config: config2,
        peerSettings: {
          allowedIps: ['10.10.1.2']
        }
      }
    ])

    // That will end up with config1 having config2 as a peer
    // and config2 having config1 as a peer
    config2.publicKey && console.log(config1.getPeer(config2.publicKey)) // logs the peer
    config1.publicKey && console.log(config2.getPeer(config1.publicKey)) // logs the peer

    // Check that the system has wireguard installed and log the version like this
    // (will throw an error if not installed)
    const wgVersion = await checkWgIsInstalled()
    console.log(wgVersion)

    // if wireguard is installed, you can bring up your config like this:
    // (make sure it's been written to file first!)
    await config1.writeToFile()
    await config1.up() // Wireguard interface is up

    // you can change something about the interface while it's up
    config1.wgInterface.dns = ['1.1.1.1']
    config1.writeToFile()

    // but make sure you restart the interface for your changes to take effect
    await config1.restart()

    // and finally, when you're done, take down the interface like this
    await config1.down()

    // Thanks for reading!
  } catch (e) {
    console.error(e)
  }
}

test()