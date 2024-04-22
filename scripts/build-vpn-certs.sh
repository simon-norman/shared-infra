#!/bin/bash

vpnname=$1
easyrsapath=$2
targetdir=$3

cd ${easyrsapath}/easyrsa3

./easyrsa init-pki

./easyrsa build-ca nopass

./easyrsa --san=DNS:${vpnname}server build-server-full ${vpnname}server nopass

./easyrsa build-client-full client.${vpnname}.tld nopass

cp pki/ca.crt ${targetdir}
cp pki/issued/${vpnname}server.crt ${targetdir}
cp pki/private/${vpnname}server.key ${targetdir}
cp pki/issued/client.${vpnname}.tld.crt ${targetdir}
cp pki/private/client.${vpnname}.tld.key ${targetdir}