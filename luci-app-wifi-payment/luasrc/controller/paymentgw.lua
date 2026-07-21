module("luci.controller.paymentgw", package.seeall)
local fs = require "nixio.fs"
local nixio = require "nixio"
local http = require "luci.http"

function index()
    entry({"admin", "services", "paymentgw", "status"}, call("action_status")).leaf = true
    entry({"admin", "services", "paymentgw", "start"}, call("action_start")).leaf = true
    entry({"admin", "services", "paymentgw", "stop"}, call("action_stop")).leaf = true
    entry({"admin", "services", "paymentgw", "restart"}, call("action_restart")).leaf = true
    entry({"admin", "services", "paymentgw", "reset"}, call("action_reset")).leaf = true
    entry({"admin", "services", "paymentgw", "reset_log"}, call("action_reset_log")).leaf = true
    entry({"admin", "services", "paymentgw", "logs"}, call("get_log_content")).leaf = true
end

function action_status()
    local status = false
    local pid = "N/A"

    local output = luci.util.exec("ps | grep '[n]ode server.js' | awk '{print $1}'")
    local trimmed = output:gsub("%s+", "")

    if trimmed ~= "" and trimmed:match("^%d+$") then
        status = true
        pid = trimmed
    end

    luci.http.prepare_content("application/json")
    luci.http.write_json({
        running = status,
        pid = pid,
        raw_output = output,
        method = "ps | grep '[n]ode server.js'"
    })
end

function action_start()
    luci.sys.init.start("wifi-payment")
    luci.http.redirect(luci.dispatcher.build_url("admin", "services", "paymentgw"))
end

function action_stop()
    luci.sys.init.stop("wifi-payment")
    luci.http.redirect(luci.dispatcher.build_url("admin", "services", "paymentgw"))
end

function action_restart()
    local http = require "luci.http"
    local util = require "luci.util"

    local result = os.execute("/etc/init.d/wifi-payment restart")

    http.prepare_content("application/json")
    http.write_json({
        success = (result == 0),
        message = result == 0 and "Service restarted successfully." or "Failed to restart service."
    })
end

function get_log_content()
    local file = "/tmp/log/wifi-payment.log"
    local f = io.open(file, "r")
    if not f then
        luci.http.status(404, "Log file not found")
        return
    end

    local lines = {}
    for line in f:lines() do
        -- Menambahkan baris ke posisi terakhir (urutan normal)
        table.insert(lines, line)
    end
    f:close()

    -- Opsional: Ambil hanya 500 baris terakhir jika file terlalu besar
    -- agar tidak membebani memori/browser
    local start_idx = #lines > 500 and (#lines - 499) or 1
    local output = {}
    for i = start_idx, #lines do
        table.insert(output, lines[i])
    end

    luci.http.prepare_content("text/plain")
    luci.http.write(table.concat(output, "\n"))
end

function action_reset_log()
    local log_file = "/tmp/log/wifi-payment.log"

    nixio.fs.writefile(log_file, "")

    http.status(200, "OK")
    http.prepare_content("application/json")
    http.write_json({ status = "success", message = "Log berhasil di-reset" })
end