FROM ubuntu

WORKDIR /app

# Run Default Apt Update and install sudo
RUN apt-get update && \
      apt-get -y install sudo

# Install all wireguard required libraries
RUN apt-get install -y apt-transport-https 
RUN apt-get install -y curl 
RUN apt-get install -y software-properties-common 
RUN apt-get install -y wireguard 
RUN apt-get install -y iproute2
RUN apt-get install -y net-tools

RUN echo "Wireguard Installed, installing NODEJS..."

#  Install Node16
RUN curl -fsSL https://deb.nodesource.com/setup_16.x | sudo -E bash -
RUN sudo apt-get install -y nodejs

# Install Yarn
RUN npm install -g yarn

# Copy Packages Over
COPY package.json .
COPY yarn.lock .
RUN yarn install

# Copy and build project
COPY . .
RUN yarn build

# Forward IP, and allow ssh and port 51820/tcp.
# RUN sudo sysctl -w net.ipv4.ip_foward=1
RUN apt-get install -y ufw
RUN sudo ufw allow ssh
RUN sudo ufw allow 51820/tcp
# RUN sudo ufw enable

CMD ["sudo", "yarn", "serve"]