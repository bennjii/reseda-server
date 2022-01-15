# reseda-server
The reseda-server network client for the reseda-mesh. Follow the below instructions to install on any ubuntu local or vps machine. 

## Install Process

1. Create Droplet - Digital Ocean [Create Key Pair and PUTTY](https://devops.ionos.com/tutorials/use-ssh-keys-with-putty-on-windows/)
2. SSH into Droplet using SSH key from key-gen
3. Create PAT (Personal Access Token) from Github 
4. Run `git clone https://github.com/UnRealReincarlution/reseda-server` pasting the PAT as the username and Enter for password.
5. Run `cd ./reseda-server`
6. Install Docker 
 - Run `sudo apt update`
 - Run `sudo apt upgrade` if upgrades occur, run `sudo reboot` and relog in.
 - Run `sudo apt install docker.io`
 - Run `sudo usermod -a -G docker $USER`
7. Install Docker-Compose
 - Run `sudo curl -L "https://github.com/docker/compose/releases/download/1.29.2/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose`
 - Run `sudo chmod +x /usr/local/bin/docker-compose`
8. Configure Server
 - Run `nano .env` if nano not installed, Run `sudo apt install nano`
 - In .env, paste from the following structure
 ```
    SERVER=<server_name e.g. sgp-1 or sf3-1>
    TZ=<timezone e.g. Asia/Singapore>
    COUNTRY=<lowercase_country_or_city>
    VIRTUAL=<boolean true/false>
    LOCATION="LAT:: <latitude> LONG:: <longitude>"
    IP=<server_hostname>
    KEY=<supabase_higher_auth_key>
    THROTTLED=<true means bandwidth capped>
 ```
 - Save using `CTRL + S`
 - Exit using `CTRL + X`
9. Run Server
 - Run `docker build . -t unrealgdev/reseda-server`
 - Run `docker-compose up -d`

All set! 
> First time docker composure should take 2-5 minutes, after that - see the server on the public registry!



---
## Applying Updates

All you need to do is run 3 commands:
   1. `git pull`
   2. `docker build . -t unrealgdev/reseda-server`
   3. `docker-compose up -d`

And the update is applied, well done!