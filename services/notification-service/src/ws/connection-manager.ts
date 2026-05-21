type UserSocket = {
  id: string; // Connection ID
  socket: any; // WebSocket client
};

class ConnectionManager {
  // Maps userId to active sockets
  private connections = new Map<string, UserSocket[]>();

  public addConnection(userId: string, connId: string, socket: any) {
    const userConns = this.connections.get(userId) || [];
    userConns.push({ id: connId, socket });
    this.connections.set(userId, userConns);
  }

  public removeConnection(userId: string, connId: string) {
    const userConns = this.connections.get(userId);
    if (!userConns) return;

    const filtered = userConns.filter(c => c.id !== connId);
    if (filtered.length === 0) {
      this.connections.delete(userId);
    } else {
      this.connections.set(userId, filtered);
    }
  }

  public sendToUser(userId: string, message: any): boolean {
    const userConns = this.connections.get(userId);
    if (!userConns || userConns.length === 0) return false;

    const rawMessage = JSON.stringify(message);
    userConns.forEach(({ socket }) => {
      try {
        if (socket.readyState === 1) { // 1 = OPEN
          socket.send(rawMessage);
        }
      } catch (err) {
        console.error(`Error sending websocket message to connection for user ${userId}:`, err);
      }
    });
    return true;
  }

  public getActiveUserCount(): number {
    return this.connections.size;
  }
}

export const connectionManager = new ConnectionManager();
