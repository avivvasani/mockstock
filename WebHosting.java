import com.sun.net.httpserver.HttpServer;
import com.sun.net.httpserver.HttpHandler;
import com.sun.net.httpserver.HttpExchange;
import java.io.IOException;
import java.io.OutputStream;
import java.net.InetSocketAddress;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.logging.Logger;
public class WebHosting 
{
    private static final Logger logger = Logger.getLogger(WebHosting.class.getName());
    private static final int PORT = 16000;
    private static final String WEBROOT_DIR = "/home/kali/Desktop/mock-stock/public";
    private static final String INDEX_FILE = "index.html";
    public static void main(String []args) throws IOException 
    {
        try 
        {
            // 1. Create the server listening on the defined port
            HttpServer server = HttpServer.create(new InetSocketAddress(PORT), 0);            
            // 2. Set the context handler for all paths (the root "/")
            server.createContext("/", new FileHandler());            
            // 3. Set server executor (null means the default single-threaded executor)
            server.setExecutor(null);             
            // 4. Start the server
            server.start();
            logger.info("Server started successfully on port " + PORT);
            logger.info("Serving file: " + Paths.get(WEBROOT_DIR, INDEX_FILE).toAbsolutePath());
        } 
        catch (IOException e) 
        {
            logger.severe("Could not start server: " + e.getMessage());
            throw e;
        }
    }
    /**
     * Handles all incoming HTTP requests. 
     * It only serves the specific index.html file regardless of the request path.
     */
    static class FileHandler implements HttpHandler 
    {
        @Override
        public void handle(HttpExchange exchange) throws IOException 
        {
            // Define the absolute path to the file to be served
            Path filePath = Paths.get(WEBROOT_DIR, INDEX_FILE);
            if (Files.exists(filePath) && Files.isRegularFile(filePath)) 
            {                   
                byte[] responseBytes = Files.readAllBytes(filePath);               
                // Set the response headers
                exchange.getResponseHeaders().set("Content-Type", "text/html; charset=UTF-8");
                exchange.sendResponseHeaders(200, responseBytes.length);
                // Write the file content to the response body
                try (OutputStream os = exchange.getResponseBody()) {
                    os.write(responseBytes);
                }
                logger.info("Successfully served " + INDEX_FILE + " for request: " + exchange.getRequestURI());
            } 
            
            else 
            {
                // File not found (404)
                String response = "Error 404: File not found. Check if 'webroot/index.html' exists.";
                exchange.sendResponseHeaders(404, response.length());
                try (OutputStream os = exchange.getResponseBody()) 
                {
                    os.write(response.getBytes());
                }
                logger.warning("File not found at path: " + filePath.toAbsolutePath());
            }
        }
    }
}
