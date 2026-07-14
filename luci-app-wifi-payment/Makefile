# This is free software, licensed under the Apache License, Version 2.0
#
# Copyright (C) 2026 Maizil <maizilpc7@gmail.com>

include $(TOPDIR)/rules.mk

LUCI_TITLE:=LuCI for Payment Gateway.
LUCI_DEPENDS:=+node +node-npm +coreutils-nohup
LUCI_DESCRIPTION:=Payment Gateway for MikroTik.

PKG_MAINTAINER:=Maizil <maizilpc7@gmail.com>
PKG_VERSION:=1.0
PKG_RELEASE:=1
PKG_LICENSE:=Apache-2.0
PKG_ARCH:=all

include $(TOPDIR)/feeds/luci/luci.mk

# call BuildPackage - OpenWrt buildroot signature
